import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDeepSeekConfig } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`ai-describe:${(session.user as any).id}`, 20, 5 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: `Забагато запитів. Спробуйте через ${rl.retryAfter} с.` }, { status: 429 });

  const { title, currentDescription } = await req.json();
  if (!title || title.trim().length < 3) {
    return NextResponse.json({ error: "Title too short" }, { status: 400 });
  }

  const { apiKey, baseUrl, model } = await getDeepSeekConfig();
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  const systemPrompt = `Ти — асистент для команди. Генеруй короткий, чіткий опис задачі українською мовою.
Опис має бути конкретним, дієвим (actionable), 1-3 речення максимум.
Не використовуй маркдаун, зірочки, заголовки. Просто чистий текст.
Не повторюй назву задачі дослівно в описі.`;

  const userPrompt = currentDescription
    ? `Назва задачі: "${title}"\nПоточний опис: "${currentDescription}"\n\nПерепиши опис краще — зроби його чіткішим, конкретнішим та більш дієвим. Залиш тільки текст опису.`
    : `Назва задачі: "${title}"\n\nНапиши короткий опис для цієї задачі. Залиш тільки текст опису.`;

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
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("DeepSeek error:", err);
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await res.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ description });
  } catch (e: any) {
    console.error("AI describe error:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
