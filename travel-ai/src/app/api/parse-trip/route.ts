import { NextResponse } from "next/server";
import { z } from "zod";

const ParseRequest = z.object({
  prompt: z.string().min(3),
});

export async function POST(req: Request) {
  try {
    const body = ParseRequest.parse(await req.json());
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const currentDate = new Date().toISOString().split('T')[0];
    
    const system = `You are a travel planning assistant. Extract trip parameters from the user's message.

Current date: ${currentDate}

Output ONLY valid JSON with these fields (use null for unknown values):
{
  "departure_airport_code": string | null,  // 3-letter IATA code for origin (e.g., "JFK", "LAX")
  "arrival_airport_code": string | null,    // 3-letter IATA code for destination
  "destination_city": string | null,        // Full city/country name (e.g., "Tokyo, Japan")
  "departure_date": string | null,          // Format: YYYY-MM-DD
  "arrival_date": string | null,            // Format: YYYY-MM-DD (return/end date)
  "trip_duration_days": number | null,      // Number of days for the trip
  "number_of_adults": number | null,        // Default to 1 if not specified
  "number_of_children": number | null,      // Ages 2-11, default to 0
  "trip_style": string | null               // e.g., "relaxing", "adventure", "cultural", "foodie"
}

Rules:
- Convert city names to their main airport IATA codes
- Also extract the full destination city name for the itinerary
- If user says "4-day trip" starting on a date, calculate the return date
- If month is mentioned without year, assume the next occurrence of that month
- For relative dates like "next week" or "in March", calculate actual dates from ${currentDate}
- Try to infer trip style from context (beach vacation = relaxing, museum tour = cultural, etc.)

No markdown. No explanation. Just the JSON object.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
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

    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw: content },
        { status: 500 }
      );
    }

    // Apply defaults
    if (parsed.number_of_adults === null) parsed.number_of_adults = 1;
    if (parsed.number_of_children === null) parsed.number_of_children = 0;

    return NextResponse.json({
      data: parsed,
      complete: true, // For trip planning, we don't require all fields
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
  }
}
