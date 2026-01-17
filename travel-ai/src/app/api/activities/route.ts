import { NextResponse } from "next/server";
import { z } from "zod";

const ActivitiesRequest = z.object({
  destination: z.string().min(1),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferences: z.string().optional(),
});

interface PlaceResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  formatted_address?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  photos?: Array<{
    photo_reference: string;
  }>;
}

interface Activity {
  id: string;
  name: string;
  address: string;
  rating?: number;
  ratingCount?: number;
  types: string[];
  photoUrl?: string;
  category: string;
}

interface DayItinerary {
  day: number;
  date: string;
  activities: Activity[];
}

// Simple mapping of common airport codes to city names
const AIRPORT_TO_CITY: Record<string, string> = {
  "JFK": "New York",
  "LGA": "New York",
  "EWR": "New York",
  "LAX": "Los Angeles",
  "SFO": "San Francisco",
  "ORD": "Chicago",
  "DFW": "Dallas",
  "MIA": "Miami",
  "ATL": "Atlanta",
  "SEA": "Seattle",
  "BOS": "Boston",
  "IAD": "Washington DC",
  "DCA": "Washington DC",
  "LHR": "London",
  "LGW": "London",
  "CDG": "Paris",
  "FRA": "Frankfurt",
  "AMS": "Amsterdam",
  "FCO": "Rome",
  "MAD": "Madrid",
  "BCN": "Barcelona",
  "NRT": "Tokyo",
  "HND": "Tokyo",
  "ICN": "Seoul",
  "PEK": "Beijing",
  "PVG": "Shanghai",
  "SYD": "Sydney",
  "MEL": "Melbourne",
  "DXB": "Dubai",
  "SIN": "Singapore",
  "BKK": "Bangkok",
  "HKG": "Hong Kong",
};

function getCityName(destination: string): string {
  // If it's a 3-letter code, try to map it
  if (destination.length === 3 && destination === destination.toUpperCase()) {
    return AIRPORT_TO_CITY[destination] || destination;
  }
  return destination;
}

export async function POST(req: Request) {
  try {
    const body = ActivitiesRequest.parse(await req.json());
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_PLACES_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Calculate number of days
    const arrival = new Date(body.arrival_date);
    const departure = new Date(body.departure_date);
    
    // Validate dates
    if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
      return NextResponse.json(
        { error: `Invalid date format. Received: arrival_date=${body.arrival_date}, departure_date=${body.departure_date}` },
        { status: 400 }
      );
    }
    
    const days = Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days <= 0) {
      return NextResponse.json(
        { 
          error: `Invalid date range: arrival_date (${body.arrival_date}) must be before departure_date (${body.departure_date}). Calculated days: ${days}` 
        },
        { status: 400 }
      );
    }

    // Use OpenAI to help organize activities by day and category
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Convert airport code to city name if needed
    const cityName = getCityName(body.destination);

    // First, search for places using Google Places API
    // Build a more flexible search query
    let searchQuery = cityName;
    if (body.preferences) {
      searchQuery = `${cityName} ${body.preferences}`;
    } else {
      searchQuery = `${cityName} tourist attractions`;
    }

    // Use Text Search API to find places (without type filter initially for better results)
    const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
    
    console.log("Google Places API query:", searchQuery);
    console.log("Google Places API URL:", placesUrl.replace(apiKey, "***"));
    
    const placesResponse = await fetch(placesUrl);
    if (!placesResponse.ok) {
      const errorText = await placesResponse.text();
      console.error("Google Places API error:", placesResponse.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch places from Google Places API: ${placesResponse.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const placesData = await placesResponse.json();
    
    // Check for API errors in response
    if (placesData.status && placesData.status !== "OK") {
      console.error("Google Places API error status:", placesData.status, placesData.error_message);
      return NextResponse.json(
        { 
          error: `Google Places API error: ${placesData.status}${placesData.error_message ? ` - ${placesData.error_message}` : ""}` 
        },
        { status: 400 }
      );
    }
    
    let places: PlaceResult[] = placesData.results || [];

    // If no results, try a broader search
    if (places.length === 0) {
      console.log("No results with initial query, trying broader search...");
      const broaderUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(cityName + " attractions")}&key=${apiKey}`;
      const broaderResponse = await fetch(broaderUrl);
      
      if (broaderResponse.ok) {
        const broaderData = await broaderResponse.json();
        if (broaderData.status === "OK" && broaderData.results && broaderData.results.length > 0) {
          places = broaderData.results;
          console.log(`Found ${places.length} places with broader search`);
        }
      }
    }

    if (places.length === 0) {
      return NextResponse.json(
        { 
          error: `No activities found for "${cityName}". Please check that the destination name is correct and that your Google Places API key has the necessary permissions.`,
          debug: {
            originalDestination: body.destination,
            convertedCityName: cityName,
            searchQuery,
            placesApiStatus: placesData.status,
          }
        },
        { status: 404 }
      );
    }

    // Process places into activities
    const activities: Activity[] = places.slice(0, Math.min(places.length, 30)).map((place, idx) => {
      // Get photo URL if available
      let photoUrl: string | undefined;
      if (place.photos && place.photos.length > 0) {
        const photo = place.photos[0];
        // Check if photo_reference exists (it might be in different formats)
        const photoRef = photo.photo_reference || (photo as any).reference;
        if (photoRef) {
          // Google Places Photo API requires maxwidth or maxheight, and the photo_reference
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&maxheight=400&photo_reference=${photoRef}&key=${apiKey}`;
        } else {
          console.log(`No photo_reference for place ${place.name}, photos:`, JSON.stringify(photo));
        }
      }

      // Categorize activity
      const types = place.types || [];
      let category = "Attraction";
      if (types.some(t => t.includes("museum"))) category = "Museum";
      else if (types.some(t => t.includes("park"))) category = "Park";
      else if (types.some(t => t.includes("restaurant"))) category = "Restaurant";
      else if (types.some(t => t.includes("shopping"))) category = "Shopping";
      else if (types.some(t => t.includes("amusement"))) category = "Entertainment";
      else if (types.some(t => t.includes("zoo") || t.includes("aquarium"))) category = "Nature";

      return {
        id: place.place_id || `place_${idx}`,
        name: place.name,
        address: place.formatted_address || "",
        rating: place.rating,
        ratingCount: place.user_ratings_total,
        types: types,
        photoUrl,
        category,
      };
    });

    // Use OpenAI to organize activities into a daily itinerary
    const systemPrompt = `You are a travel itinerary planner. Organize activities into a ${days}-day itinerary.
    
Output ONLY valid JSON with this structure:
{
  "itinerary": [
    {
      "day": number,
      "date": string (YYYY-MM-DD),
      "activities": [
        {
          "id": string,
          "time": string (e.g., "09:00", "14:00", "19:00"),
          "duration": string (e.g., "2 hours", "3 hours"),
          "notes": string (optional suggestions)
        }
      ]
    }
  ]
}

Rules:
- Distribute activities evenly across days
- Group nearby activities on the same day
- Include 2-4 activities per day
- Consider opening hours (museums/attractions in morning/afternoon, restaurants in evening)
- Start days around 9-10 AM
- End days around 6-8 PM
- Mix different types of activities (museums, parks, restaurants, etc.)
- Consider user preferences: ${body.preferences || "general tourism"}

Available activities:
${JSON.stringify(activities.map(a => ({ id: a.id, name: a.name, category: a.category })), null, 2)}

Calculate dates starting from ${body.arrival_date} (day 1) to ${body.departure_date} (day ${days}).

No markdown. Just JSON.`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a ${days}-day itinerary for ${body.destination}` },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      // Fallback: simple distribution without AI
      return generateFallbackItinerary(activities, days, body.arrival_date, body.departure_date);
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData?.choices?.[0]?.message?.content;

    let itineraryData: any;
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      itineraryData = JSON.parse(cleaned);
    } catch {
      // Fallback if JSON parsing fails
      return generateFallbackItinerary(activities, days, body.arrival_date, body.departure_date);
    }

    // Enrich itinerary with full activity details
    const activityMap = new Map(activities.map(a => [a.id, a]));
    const enrichedItinerary: DayItinerary[] = itineraryData.itinerary.map((day: any) => {
      const date = new Date(body.arrival_date);
      date.setDate(date.getDate() + (day.day - 1));
      
      return {
        day: day.day,
        date: date.toISOString().split('T')[0],
        activities: day.activities.map((act: any) => {
          const fullActivity = activityMap.get(act.id);
          return {
            ...fullActivity,
            time: act.time,
            duration: act.duration,
            notes: act.notes,
          };
        }).filter((act: any) => act !== undefined),
      };
    });

    return NextResponse.json({
      success: true,
      destination: cityName,
      days,
      itinerary: enrichedItinerary,
      allActivities: activities,
    });
  } catch (e: any) {
    console.error("Activities error:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: e.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

function generateFallbackItinerary(
  activities: Activity[],
  days: number,
  arrivalDate: string,
  departureDate: string
): NextResponse {
  const activitiesPerDay = Math.ceil(activities.length / days);
  const itinerary: DayItinerary[] = [];
  const times = ["09:00", "12:00", "15:00", "18:00"];

  for (let day = 1; day <= days; day++) {
    const date = new Date(arrivalDate);
    date.setDate(date.getDate() + (day - 1));
    
    const startIdx = (day - 1) * activitiesPerDay;
    const endIdx = Math.min(startIdx + activitiesPerDay, activities.length);
    const dayActivities = activities.slice(startIdx, endIdx);

    itinerary.push({
      day,
      date: date.toISOString().split('T')[0],
      activities: dayActivities.map((act, idx) => ({
        ...act,
        time: times[idx % times.length],
        duration: idx % 2 === 0 ? "2 hours" : "3 hours",
        notes: `Visit ${act.name}`,
      })),
    });
  }

  return NextResponse.json({
    success: true,
    destination: getCityName(""),
    days,
    itinerary,
    allActivities: activities,
  });
}
