import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDeepSeekConfig } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`ai-agenda:${(session.user as any).id}`, 20, 5 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: `Забагато запитів. Спробуйте через ${rl.retryAfter} с.` }, { status: 429 });

  const { title, description, currentAgenda } = await req.json();
  if (!title || title.trim().length < 3) {
    return NextResponse.json({ error: "Title too short" }, { status: 400 });
  }

  const { apiKey, baseUrl, model } = await getDeepSeekConfig();
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  const systemPrompt = `Ти — асистент для підготовки мітингів. Генеруй список питань/тем для обговорення українською мовою.
Кожен пункт — конкретне питання або тема, 1 коротке речення.
Генеруй 4-7 пунктів залежно від складності теми.
Поверни ТІЛЬКИ JSON масив рядків, наприклад: ["Питання 1", "Питання 2", "Питання 3"]
Без маркдаун, без нумерації, без додаткового тексту — тільки JSON масив.`;

  let userPrompt = `Назва мітингу: "${title}"`;
  if (description) userPrompt += `\nОпис: "${description}"`;
  if (currentAgenda && currentAgenda.length > 0) {
    userPrompt += `\nПоточні питання: ${JSON.stringify(currentAgenda)}`;
    userPrompt += `\n\nПерегенеруй список — зроби його кращим, конкретнішим. Поверни ТІЛЬКИ JSON масив.`;
  } else {
    userPrompt += `\n\nСтвори список питань для обговорення. Поверни ТІЛЬКИ JSON масив.`;
  }

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("DeepSeek error:", err);
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "[]";

    let agenda: string[];
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      agenda = JSON.parse(cleaned);
      if (!Array.isArray(agenda)) agenda = [];
      agenda = agenda.filter((item: any) => typeof item === "string" && item.trim().length > 0);
    } catch {
      agenda = raw.split("\n").filter((l: string) => l.trim().length > 0).map((l: string) => l.replace(/^\d+\.\s*/, "").replace(/^-\s*/, "").trim());
    }

    return NextResponse.json({ agenda });
  } catch (e: any) {
    console.error("AI agenda error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
