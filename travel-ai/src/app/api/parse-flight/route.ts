import { NextResponse } from "next/server";
import { z } from "zod";

const ParseRequest = z.object({
  prompt: z.string().min(3),
  previousData: z.record(z.string(), z.any()).optional(),
});

// Required fields for FlightAPI round trip
const REQUIRED_FIELDS = [
  "departure_airport_code",
  "arrival_airport_code", 
  "departure_date",
  "arrival_date",
  "number_of_adults",
  "number_of_children",
  "number_of_infants",
  "cabin_class",
  "currency",
];

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
    
    const system = `You are a flight booking assistant. Extract flight search parameters from the user's message.

Current date: ${currentDate}

Output ONLY valid JSON with these fields (use null for unknown values):
{
  "departure_airport_code": string | null,  // 3-letter IATA code (e.g., "JFK", "LAX", "NRT")
  "arrival_airport_code": string | null,    // 3-letter IATA code
  "departure_date": string | null,          // Format: YYYY-MM-DD
  "arrival_date": string | null,            // Format: YYYY-MM-DD (return date)
  "number_of_adults": number | null,        // Default to 1 if not specified
  "number_of_children": number | null,      // Ages 2-11, default to 0
  "number_of_infants": number | null,       // Under 2, default to 0
  "cabin_class": string | null,             // "Economy", "Business", "First", or "Premium_Economy"
  "currency": string | null                 // e.g., "USD", "EUR", "JPY"
}

Rules:
- Convert city names to their main airport IATA codes (NYC → JFK, Tokyo → NRT or HND, London → LHR, Paris → CDG, etc.)
- If user says "4-day trip" starting on a date, calculate the return date
- If month is mentioned without year, assume the next occurrence of that month
- For relative dates like "next week" or "in March", calculate actual dates from ${currentDate}
- If cabin class not specified, leave null (we'll default to Economy)
- If currency not specified, leave null (we'll default to USD)
- Assume 1 adult if not specified
- Assume 0 children and 0 infants if not specified

${body.previousData ? `\nPreviously extracted data (merge with new info):\n${JSON.stringify(body.previousData, null, 2)}` : ''}

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
      // Clean up potential markdown code blocks
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw: content },
        { status: 500 }
      );
    }

    // Merge with previous data if provided
    if (body.previousData) {
      for (const key of Object.keys(body.previousData)) {
        if (parsed[key] === null && body.previousData[key] !== null) {
          parsed[key] = body.previousData[key];
        }
      }
    }

    // Apply defaults
    if (parsed.number_of_adults === null) parsed.number_of_adults = 1;
    if (parsed.number_of_children === null) parsed.number_of_children = 0;
    if (parsed.number_of_infants === null) parsed.number_of_infants = 0;
    if (parsed.currency === null) parsed.currency = "USD";
    if (parsed.cabin_class === null) parsed.cabin_class = "Economy";

    // Find missing required fields
    const missingFields: string[] = [];
    const fieldLabels: Record<string, string> = {
      departure_airport_code: "departure city/airport",
      arrival_airport_code: "destination city/airport",
      departure_date: "departure date",
      arrival_date: "return date",
    };

    for (const field of ["departure_airport_code", "arrival_airport_code", "departure_date", "arrival_date"]) {
      if (parsed[field] === null || parsed[field] === undefined) {
        missingFields.push(fieldLabels[field] || field);
      }
    }

    return NextResponse.json({
      data: parsed,
      complete: missingFields.length === 0,
      missingFields,
      followUpQuestion: missingFields.length > 0 
        ? `I still need to know your ${missingFields.join(", ")}. Could you provide ${missingFields.length === 1 ? "that" : "those"}?`
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
  }
}
