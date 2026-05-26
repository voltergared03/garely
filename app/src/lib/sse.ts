// Shared parser for OpenAI-compatible SSE streams (`data: {json}` lines,
// terminated by `data: [DONE]`). Previously duplicated in the meeting chat
// route and lib/regenerate.ts.
//
// Takes a reader (not the stream) so the caller keeps ownership and can still
// cancel it on client disconnect.

/**
 * Yield each parsed JSON chunk from an SSE byte stream. Silently skips
 * keep-alives and partial/non-JSON lines.
 */
export async function* sseJsonChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<any, void, unknown> {
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        yield JSON.parse(payload);
      } catch {
        /* ignore keep-alive / partial chunks */
      }
    }
  }
}

/** Text delta from an OpenAI-compatible streaming chunk ('' if none). */
export function chunkDelta(chunk: any): string {
  const d = chunk?.choices?.[0]?.delta?.content;
  return typeof d === 'string' ? d : '';
}
