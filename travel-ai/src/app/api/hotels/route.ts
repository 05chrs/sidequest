import { NextResponse } from "next/server";
import { z } from "zod";

const HotelSearchRequest = z.object({
  destination: z.string().min(1),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().min(1).max(10).default(2),
  children: z.number().min(0).max(10).default(0),
  currency: z.string().length(3).default("USD"),
  preferences: z.string().optional(), // User preferences for filtering (e.g., "no hostels", "luxury only")
});

const SERPAPI_KEY = "019ddfecd936f26a96e26dc2f43c05860339d1b0952dcb99b855aa5e65733f05";

export interface HotelResult {
  name: string;
  type: string;
  description?: string;
  link?: string;
  thumbnail?: string;
  rating: number;
  reviews: number;
  hotel_class?: number;
  price: number;
  price_formatted: string;
  total_price?: number;
  total_price_formatted?: string;
  amenities: string[];
  gps_coordinates?: { latitude: number; longitude: number };
  check_in_time?: string;
  check_out_time?: string;
  property_token?: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = HotelSearchRequest.parse(body);

    const params = new URLSearchParams({
      engine: "google_hotels",
      q: parsed.destination,
      check_in_date: parsed.check_in_date,
      check_out_date: parsed.check_out_date,
      adults: String(parsed.adults),
      children: String(parsed.children),
      currency: parsed.currency,
      gl: "us",
      hl: "en",
      api_key: SERPAPI_KEY,
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    console.log("Calling SerpAPI Google Hotels:", url.replace(SERPAPI_KEY, "***"));

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SerpAPI error:", response.status, errorText);
      return NextResponse.json(
        { error: `Hotel API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Parse user preferences for filtering
    const filters = parsePreferences(parsed.preferences || "");
    
    // Process the properties array from SerpAPI response
    const hotels = processHotels(data, filters);
    
    return NextResponse.json({
      success: true,
      hotels,
      total_results: data.search_information?.total_results || hotels.length,
      filters_applied: filters,
    });
  } catch (e: any) {
    console.error("Hotels API error:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: e.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

interface HotelFilters {
  excludeTypes: string[]; // e.g., ["hostel", "motel", "backpacker"]
  minStars: number | null; // e.g., 3 for "3-star or above"
  maxStars: number | null; // e.g., 3 for "budget only"
  preferLuxury: boolean;
  preferBudget: boolean;
  excludeVacationRentals: boolean;
}

function parsePreferences(preferences: string): HotelFilters {
  const lower = preferences.toLowerCase();
  const filters: HotelFilters = {
    excludeTypes: [],
    minStars: null,
    maxStars: null,
    preferLuxury: false,
    preferBudget: false,
    excludeVacationRentals: false,
  };

  // Detect exclusions
  const exclusionPatterns = [
    { pattern: /no\s*(hostels?|backpackers?)/i, type: "hostel" },
    { pattern: /don'?t\s*want\s*(hostels?|backpackers?)/i, type: "hostel" },
    { pattern: /avoid\s*(hostels?|backpackers?)/i, type: "hostel" },
    { pattern: /no\s*motels?/i, type: "motel" },
    { pattern: /don'?t\s*want\s*motels?/i, type: "motel" },
    { pattern: /no\s*airbnb/i, type: "vacation rental" },
    { pattern: /no\s*vacation\s*rentals?/i, type: "vacation rental" },
    { pattern: /hotels?\s*only/i, type: "vacation rental" }, // If they say "hotels only", exclude vacation rentals
    { pattern: /no\s*budget/i, type: "budget" },
    { pattern: /no\s*cheap/i, type: "budget" },
  ];

  for (const { pattern, type } of exclusionPatterns) {
    if (pattern.test(lower)) {
      if (type === "vacation rental") {
        filters.excludeVacationRentals = true;
      } else if (type === "budget") {
        filters.minStars = 3;
      } else {
        filters.excludeTypes.push(type);
      }
    }
  }

  // Detect star preferences
  const starPatterns = [
    { pattern: /(\d)\s*star\s*(or\s*)?(above|higher|\+|minimum|min)/i, minStars: true },
    { pattern: /at\s*least\s*(\d)\s*star/i, minStars: true },
    { pattern: /minimum\s*(\d)\s*star/i, minStars: true },
    { pattern: /(\d)\+\s*star/i, minStars: true },
    { pattern: /only\s*(\d)\s*star/i, exactStars: true },
  ];

  for (const { pattern, minStars, exactStars } of starPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const stars = parseInt(match[1]);
      if (minStars) {
        filters.minStars = stars;
      } else if (exactStars) {
        filters.minStars = stars;
        filters.maxStars = stars;
      }
    }
  }

  // Detect luxury preference
  if (/luxury|luxurious|high[\s-]?end|5[\s-]?star|five[\s-]?star|upscale|premium/i.test(lower)) {
    filters.preferLuxury = true;
    if (!filters.minStars || filters.minStars < 4) {
      filters.minStars = 4;
    }
  }

  // Detect budget preference (but not exclusion)
  if (/budget[\s-]?friendly|cheap|affordable|inexpensive|low[\s-]?cost/i.test(lower) && !filters.minStars) {
    filters.preferBudget = true;
    filters.maxStars = 3;
  }

  return filters;
}

function processHotels(data: any, filters: HotelFilters): HotelResult[] {
  const hotels: HotelResult[] = [];

  // Process regular properties
  if (data.properties && Array.isArray(data.properties)) {
    for (const property of data.properties) {
      const hotel = extractHotelInfo(property);
      if (hotel && passesFilters(hotel, filters)) {
        hotels.push(hotel);
      }
    }
  }

  // Also include ads if present (they're often good deals)
  if (data.ads && Array.isArray(data.ads)) {
    for (const ad of data.ads.slice(0, 3)) {
      const hotel = extractHotelFromAd(ad);
      if (hotel && passesFilters(hotel, filters)) {
        hotels.push(hotel);
      }
    }
  }

  // Sort by price and return top 10
  return hotels
    .filter((h) => h.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, 10);
}

function passesFilters(hotel: HotelResult, filters: HotelFilters): boolean {
  const nameLower = hotel.name.toLowerCase();
  const typeLower = hotel.type.toLowerCase();

  // Check excluded types by name
  for (const excludeType of filters.excludeTypes) {
    if (nameLower.includes(excludeType)) {
      return false;
    }
    // Also check common variations
    if (excludeType === "hostel" && (nameLower.includes("backpacker") || nameLower.includes("dormitory") || nameLower.includes("dorm"))) {
      return false;
    }
  }

  // Check vacation rental exclusion
  if (filters.excludeVacationRentals && typeLower.includes("vacation rental")) {
    return false;
  }

  // Check star rating
  if (hotel.hotel_class) {
    if (filters.minStars && hotel.hotel_class < filters.minStars) {
      return false;
    }
    if (filters.maxStars && hotel.hotel_class > filters.maxStars) {
      return false;
    }
  } else {
    // No star rating - be lenient unless luxury is required
    if (filters.preferLuxury) {
      return false; // Exclude unrated hotels for luxury preference
    }
  }

  return true;
}

function extractHotelInfo(property: any): HotelResult | null {
  if (!property.name) return null;

  const ratePerNight = property.rate_per_night;
  const totalRate = property.total_rate;

  let price = 0;
  let priceFormatted = "";

  if (ratePerNight) {
    price = ratePerNight.extracted_lowest || ratePerNight.extracted_before_taxes_fees || 0;
    priceFormatted = ratePerNight.lowest || ratePerNight.before_taxes_fees || "";
  }

  // Get first image thumbnail
  let thumbnail = "";
  if (property.images && property.images.length > 0) {
    thumbnail = property.images[0].thumbnail || property.images[0].original_image || "";
  }

  return {
    name: property.name,
    type: property.type || "hotel",
    description: property.description || "",
    link: property.link || "",
    thumbnail,
    rating: property.overall_rating || 0,
    reviews: property.reviews || 0,
    hotel_class: property.extracted_hotel_class || undefined,
    price,
    price_formatted: priceFormatted,
    total_price: totalRate?.extracted_lowest || undefined,
    total_price_formatted: totalRate?.lowest || undefined,
    amenities: property.amenities || [],
    gps_coordinates: property.gps_coordinates || undefined,
    check_in_time: property.check_in_time || undefined,
    check_out_time: property.check_out_time || undefined,
    property_token: property.property_token || undefined,
  };
}

function extractHotelFromAd(ad: any): HotelResult | null {
  if (!ad.name) return null;

  return {
    name: ad.name,
    type: "hotel",
    description: "",
    link: ad.link || "",
    thumbnail: ad.thumbnail || "",
    rating: ad.overall_rating || 0,
    reviews: ad.reviews || 0,
    hotel_class: ad.hotel_class || undefined,
    price: ad.extracted_price || 0,
    price_formatted: ad.price || "",
    amenities: ad.amenities || [],
    gps_coordinates: ad.gps_coordinates || undefined,
    property_token: ad.property_token || undefined,
  };
}
