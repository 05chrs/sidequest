import { NextResponse } from "next/server";

const HOTEL_API_KEY = "696bf3c39a4234b73f7b59bb";

// Fallback city IDs for common destinations (when API is rate-limited)
const COMMON_CITIES: Record<string, { id: string; name: string }> = {
  "new york": { id: "60763", name: "New York City, New York" },
  "nyc": { id: "60763", name: "New York City, New York" },
  "new york city": { id: "60763", name: "New York City, New York" },
  "manhattan": { id: "60763", name: "New York City, New York" },
  "los angeles": { id: "32655", name: "Los Angeles, California" },
  "la": { id: "32655", name: "Los Angeles, California" },
  "chicago": { id: "35805", name: "Chicago, Illinois" },
  "san francisco": { id: "60713", name: "San Francisco, California" },
  "sf": { id: "60713", name: "San Francisco, California" },
  "miami": { id: "34438", name: "Miami, Florida" },
  "las vegas": { id: "45963", name: "Las Vegas, Nevada" },
  "vegas": { id: "45963", name: "Las Vegas, Nevada" },
  "boston": { id: "60745", name: "Boston, Massachusetts" },
  "seattle": { id: "60878", name: "Seattle, Washington" },
  "washington dc": { id: "60902", name: "Washington D.C." },
  "washington": { id: "60902", name: "Washington D.C." },
  "dc": { id: "60902", name: "Washington D.C." },
  "orlando": { id: "34515", name: "Orlando, Florida" },
  "denver": { id: "60439", name: "Denver, Colorado" },
  "austin": { id: "30196", name: "Austin, Texas" },
  "dallas": { id: "60449", name: "Dallas, Texas" },
  "houston": { id: "56003", name: "Houston, Texas" },
  "atlanta": { id: "60898", name: "Atlanta, Georgia" },
  "philadelphia": { id: "60795", name: "Philadelphia, Pennsylvania" },
  "san diego": { id: "60750", name: "San Diego, California" },
  "phoenix": { id: "60811", name: "Phoenix, Arizona" },
  "london": { id: "186338", name: "London, United Kingdom" },
  "paris": { id: "187147", name: "Paris, France" },
  "tokyo": { id: "298184", name: "Tokyo, Japan" },
  "rome": { id: "187791", name: "Rome, Italy" },
  "barcelona": { id: "187497", name: "Barcelona, Spain" },
  "amsterdam": { id: "188590", name: "Amsterdam, Netherlands" },
  "dubai": { id: "295424", name: "Dubai, United Arab Emirates" },
  "singapore": { id: "294265", name: "Singapore" },
  "hong kong": { id: "294217", name: "Hong Kong, China" },
  "sydney": { id: "255060", name: "Sydney, Australia" },
  "toronto": { id: "155019", name: "Toronto, Canada" },
  "vancouver": { id: "154943", name: "Vancouver, Canada" },
  "cancun": { id: "150807", name: "Cancun, Mexico" },
  "hawaii": { id: "60603", name: "Honolulu, Hawaii" },
  "honolulu": { id: "60603", name: "Honolulu, Hawaii" },
  "maui": { id: "60634", name: "Maui, Hawaii" },
};

function findCityInFallback(name: string): { id: string; name: string } | null {
  const normalized = name.toLowerCase().trim();
  if (COMMON_CITIES[normalized]) {
    return COMMON_CITIES[normalized];
  }
  // Try partial match
  for (const [key, value] of Object.entries(COMMON_CITIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { error: "Missing 'name' parameter" },
        { status: 400 }
      );
    }

    // First check fallback for common cities
    const fallbackCity = findCityInFallback(name);

    const url = `https://api.makcorps.com/mapping?api_key=${HOTEL_API_KEY}&name=${encodeURIComponent(name)}`;
    
    console.log("Calling Mapping API:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mapping API error:", response.status, errorText);
      
      // Use fallback if API fails (rate limited, etc.)
      if (fallbackCity) {
        console.log("Using fallback city:", fallbackCity);
        return NextResponse.json({
          cities: [{ id: fallbackCity.id, name: fallbackCity.name, displayName: fallbackCity.name }],
          hotels: [],
          fromFallback: true,
        });
      }
      
      return NextResponse.json(
        { error: `Mapping API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Filter for GEO (city) results and format them
    let cities = data
      .filter((item: any) => item.type === "GEO")
      .map((item: any) => ({
        id: item.document_id,
        name: item.name,
        displayName: item.details?.highlighted_name || item.name,
        parentName: item.details?.parent_name,
        coords: item.coords,
      }));

    // If no cities found from API but we have a fallback, use it
    if (cities.length === 0 && fallbackCity) {
      cities = [{ id: fallbackCity.id, name: fallbackCity.name, displayName: fallbackCity.name }];
    }

    // Also include hotels in case user wants a specific hotel
    const hotels = data
      .filter((item: any) => item.type === "HOTEL")
      .slice(0, 5)
      .map((item: any) => ({
        id: item.document_id,
        name: item.name,
        displayName: item.details?.highlighted_name || item.name,
        address: item.details?.address,
        parentName: item.details?.parent_name,
        coords: item.coords,
      }));

    return NextResponse.json({
      cities,
      hotels,
      raw: data,
    });
  } catch (e: any) {
    console.error("City lookup error:", e);
    
    // Use fallback on any error
    if (fallbackCity) {
      console.log("Using fallback city after error:", fallbackCity);
      return NextResponse.json({
        cities: [{ id: fallbackCity.id, name: fallbackCity.name, displayName: fallbackCity.name }],
        hotels: [],
        fromFallback: true,
      });
    }
    
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
