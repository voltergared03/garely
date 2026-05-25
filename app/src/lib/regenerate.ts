// Re-transcription + report regeneration used by the report "fix language &
// regenerate" feature. Reads a single speaker's captured WAV, re-runs Deepgram
// in a corrected language, then regenerates the DeepSeek report from the (now
// corrected) full transcript. Deliberately does NOT notify/email participants —
// this is a manual, human-in-the-loop correction.
import fs from 'node:fs/promises';
import { prisma } from './prisma';
import { readConfig, getDeepSeekConfig } from './config';
import { workspaceLocale } from './i18n-server';

export interface ReTranscribedSegment {
  content: string;
  start: number;
  end: number;
  confidence: number;
}

/** Re-transcribe a single speaker's WAV file in a specific language. */
export async function transcribeSpeakerFile(
  filePath: string,
  language: string
): Promise<ReTranscribedSegment[]> {
  const cfg = await readConfig(['DEEPGRAM_API_KEY']);
  const key = cfg.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY || '';
  if (!key) throw new Error('Deepgram API key not configured');

  const audio = await fs.readFile(filePath);

  // nova-2 + a single explicit language is the most accurate combo for the
  // confusable uk/ru/en set (validated); utterances give clean segment splits.
  const url = new URL('https://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', language);
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');
  url.searchParams.set('utterances', 'true');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/wav' },
    body: new Uint8Array(audio),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Deepgram ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();

  const out: ReTranscribedSegment[] = [];
  for (const u of data?.results?.utterances || []) {
    const content = String(u.transcript || '').trim();
    if (content) {
      out.push({
        content,
        start: Number(u.start) || 0,
        end: Number(u.end) || 0,
        confidence: Number(u.confidence) || 0,
      });
    }
  }
  // Fallback: no utterances → use the whole-channel transcript as one segment.
  if (out.length === 0) {
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    const t = String(alt?.transcript || '').trim();
    if (t) out.push({ content: t, start: 0, end: 0, confidence: Number(alt?.confidence) || 0 });
  }
  return out;
}

function parseDueDate(desc: string): Date | null {
  const now = new Date();
  const lower = desc.toLowerCase();
  if (lower.includes('завтра') || lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes('тижн') || lower.includes('week')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (lower.includes('місяц') || lower.includes('month')) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (lower.includes("п'ятниц") || lower.includes('friday')) {
    const d = new Date(now);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d;
  }
  return null;
}

/**
 * Regenerate the meeting report from the current transcript via DeepSeek, in the
 * workspace language. Replaces the previous report + AI tasks atomically;
 * preserves manual tasks. No notifications/emails (manual correction).
 */
export async function regenerateMeetingReport(meetingId: string): Promise<void> {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    orderBy: { startTime: 'asc' },
    select: { speakerName: true, content: true, language: true },
  });
  if (segments.length === 0) return;

  const ds = await getDeepSeekConfig();
  if (!ds.apiKey) throw new Error('DeepSeek API key not configured');

  const wsLoc = await workspaceLocale();
  const langName = wsLoc === 'uk' ? 'Ukrainian' : 'English';
  const transcriptText = segments
    .map((s) => `[${(s.language || '??').toUpperCase()}] ${s.speakerName || '?'}: ${s.content}`)
    .join('\n');

  const prompt = `Analyze this meeting transcript and provide a structured JSON response.
The meeting was conducted in multiple languages (Ukrainian, English, Russian).
Respond in ${langName}.

TRANSCRIPT:
${transcriptText}

Provide a JSON response with this exact structure:
{
  "summary": "2-3 paragraph TL;DR of the meeting in ${langName}",
  "agenda": ["topic 1", "topic 2"],
  "decisions": ["decision 1", "decision 2"],
  "action_items": [
    {
      "title": "task description",
      "assignee_name": "person name from transcript or null",
      "priority": "high|medium|low",
      "due_description": "timeframe mentioned or null"
    }
  ],
  "follow_ups": ["follow-up item 1", "follow-up item 2"]
}`;

  const res = await fetch(`${ds.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ds.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ds.model,
      messages: [
        { role: 'system', content: 'You are a meeting analysis assistant. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const content: string = data.choices?.[0]?.message?.content || '{}';
  const report = JSON.parse(content);
  const items = Array.isArray(report.action_items) ? report.action_items : [];

  // Resolve assignees by name before opening the transaction.
  const resolved = await Promise.all(
    items.map(async (item: any) => {
      let assigneeId: string | null = null;
      if (item.assignee_name) {
        const u = await prisma.user.findFirst({
          where: { name: { contains: String(item.assignee_name), mode: 'insensitive' } },
          select: { id: true, preferences: true },
        });
        assigneeId = u?.id || null;
      }
      return {
        title: String(item.title || '').trim() || '(untitled)',
        assigneeId,
        assigneeName: item.assignee_name || null,
        priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
        dueDate: item.due_description ? parseDueDate(String(item.due_description)) : null,
      };
    })
  );

  await prisma.$transaction(async (tx) => {
    await tx.meetingTask.deleteMany({ where: { meetingId, source: 'ai' } });
    await tx.meetingReport.deleteMany({ where: { meetingId } });
    const created = await tx.meetingReport.create({
      data: {
        meetingId,
        summary: report.summary || '',
        agenda: report.agenda || [],
        decisions: report.decisions || [],
        followUps: report.follow_ups || [],
        modelUsed: ds.model,
        tokensInput: data.usage?.prompt_tokens || 0,
        tokensOutput: data.usage?.completion_tokens || 0,
        rawPrompt: prompt,
        rawResponse: content,
      },
    });
    for (const r of resolved) {
      await tx.meetingTask.create({
        data: {
          meetingId,
          reportId: created.id,
          title: r.title,
          assigneeId: r.assigneeId,
          assigneeName: r.assigneeName,
          priority: r.priority,
          status: 'open',
          dueDate: r.dueDate,
          source: 'ai',
        },
      });
    }
  });
}
