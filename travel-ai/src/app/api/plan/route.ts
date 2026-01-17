import { NextResponse } from "next/server";
import { z } from "zod";

const PlanRequest = z.object({
  prompt: z.string().min(5),
});

export async function POST(req: Request) {
  try {
    const body = PlanRequest.parse(await req.json());

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Minimal “agentic” structure: enforce JSON only
    const system = `
You are a travel planning agent. Output ONLY valid JSON that matches this shape:
{
  "destination": string,
  "dates": string,
  "budget": string,
  "traveler_profile": string,
  "flights": { "origin": string, "cabin": string, "notes": string },
  "hotel": { "area": string, "nights": number, "style": string, "notes": string },
  "itinerary": [
    { "day": number, "title": string, "morning": string[], "afternoon": string[], "evening": string[] }
  ],
  "booking_ctas": { "flight": string, "hotel": string, "activities": string }
}
No markdown. No extra keys.
    `.trim();

    // Use the built-in fetch (no SDK needed)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: body.prompt },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: `OpenAI error: ${t}` }, { status: 500 });
    }

    const json = await r.json();
    const content = json?.choices?.[0]?.message?.content;

    // Try parse as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw: content },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
  }
}

