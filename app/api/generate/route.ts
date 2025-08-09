import { NextRequest, NextResponse } from "next/server";

type GenerateRequestBody = {
  prompt: string;
  direction?: string;
  model?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { prompt, direction, model }: GenerateRequestBody = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on server" }, { status: 500 });
    }

    const system = [
      "You generate exactly 2 vertical video slides as Markdown.",
      "Separate slides with a line that contains only ---.",
      "Prefer short, punchy text suitable for on-screen reading.",
      "If you include an image, use standard Markdown: ![alt](image description only)",
      "Do NOT include real URLs in image links; the () should contain the natural language description only.",
      "Avoid code fences. Output only the raw Markdown for the 2 slides.",
    ].join(" \n");

    const userContent = [
      `Topic or seed: ${prompt}`,
      direction ? `Direction or style guide: ${direction}` : null,
      "Produce exactly 2 slides.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
      }),
      // @ts-ignore RequestInit type mismatch in edge/runtime sometimes
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${errText}` }, { status: 502 });
    }

    const data = (await response.json()) as any;
    const markdown: string | undefined = data?.choices?.[0]?.message?.content;
    if (!markdown) {
      return NextResponse.json({ error: "No content returned from model" }, { status: 502 });
    }

    return NextResponse.json({ markdown });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
