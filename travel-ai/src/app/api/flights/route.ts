import { NextResponse } from "next/server";
import { z } from "zod";

const FlightSearchRequest = z.object({
  departure_airport_code: z.string().length(3),
  arrival_airport_code: z.string().length(3),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  number_of_adults: z.number().min(1).max(9),
  number_of_children: z.number().min(0).max(9),
  number_of_infants: z.number().min(0).max(9),
  cabin_class: z.enum(["Economy", "Business", "First", "Premium_Economy"]),
  currency: z.string().length(3),
});

// Prefer env var on Vercel; fallback keeps your hackathon demo working locally
const FLIGHT_API_KEY = process.env.FLIGHT_API_KEY || "696c238d33a065399aba87d5";

export async function POST(req: Request) {
  try {
    const body = FlightSearchRequest.parse(await req.json());

    if (!FLIGHT_API_KEY) {
      return NextResponse.json(
        { error: "Missing FLIGHT_API_KEY" },
        { status: 500 }
      );
    }

    // Schema: /roundtrip/<api-key>/<departure>/<arrival>/<dep_date>/<arr_date>/<adults>/<children>/<infants>/<cabin>/<currency>
    const url = `https://api.flightapi.io/roundtrip/${FLIGHT_API_KEY}/${body.departure_airport_code}/${body.arrival_airport_code}/${body.departure_date}/${body.arrival_date}/${body.number_of_adults}/${body.number_of_children}/${body.number_of_infants}/${body.cabin_class}/${body.currency}`;

    console.log("Calling FlightAPI:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FlightAPI error:", response.status, errorText);
      return NextResponse.json(
        { error: `FlightAPI error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    const processedFlights = processFlightData(data, body);

    return NextResponse.json({
      success: true,
      searchParams: body,
      rawResultCount: data?.itineraries?.length || 0,
      flights: processedFlights,
      raw: data,
    });
  } catch (e) {
    console.error("Flight search error:", e);

    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid search parameters", details: e.issues },
        { status: 400 }
      );
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface ProcessedFlight {
  id: string;
  price: number;
  currency: string;
  outbound: LegInfo;
  return: LegInfo;
  bookingUrl?: string;
}

interface LegInfo {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: number;
  stops: number;
  segments: SegmentInfo[];
}

interface SegmentInfo {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: number;
  flightNumber: string;
  carrier: string;
}

function processFlightData(data: any, searchParams: any): ProcessedFlight[] {
  if (!data?.itineraries || !Array.isArray(data.itineraries)) {
    return [];
  }

  const legs: Map<string, any> = new Map(data.legs?.map((l: any) => [String(l.id), l]) || []);
  const segments: Map<string, any> = new Map(data.segments?.map((s: any) => [String(s.id), s]) || []);
  const places: Map<string, any> = new Map(data.places?.map((p: any) => [String(p.id), p]) || []);
  const carriers: Map<string, any> = new Map(data.carriers?.map((c: any) => [String(c.id), c]) || []);  

  const sortedItineraries = [...data.itineraries].sort((a: any, b: any) => {
    const priceA =
      a.cheapest_price?.amount || a.pricing_options?.[0]?.price?.amount || Infinity;
    const priceB =
      b.cheapest_price?.amount || b.pricing_options?.[0]?.price?.amount || Infinity;
    return priceA - priceB;
  });

  return sortedItineraries.slice(0, 10).map((itinerary: any) => {
    const cheapestPrice =
      itinerary.cheapest_price?.amount || itinerary.pricing_options?.[0]?.price?.amount || 0;

    const [outboundLegId, returnLegId] = itinerary.leg_ids || [];
    const outboundLeg = legs.get(outboundLegId);
    const returnLeg = legs.get(returnLegId);

    const processLeg = (leg: any): LegInfo => {
      if (!leg) {
        return {
          from: "",
          to: "",
          departure: "",
          arrival: "",
          duration: 0,
          stops: 0,
          segments: [],
        };
      }

      const legSegments = (leg.segment_ids || [])
        .map((segId: string) => {
          const seg = segments.get(segId);
          if (!seg) return null;

          const fromPlace = places.get(seg.origin_place_id);
          const toPlace = places.get(seg.destination_place_id);
          const carrier = carriers.get(seg.marketing_carrier_id);

          return {
            from: fromPlace?.iata || fromPlace?.name || String(seg.origin_place_id),
            to: toPlace?.iata || toPlace?.name || String(seg.destination_place_id),
            departure: seg.departure,
            arrival: seg.arrival,
            duration: seg.duration,
            flightNumber: seg.marketing_flight_number || "",
            carrier: carrier?.name || carrier?.iata || "",
          };
        })
        .filter(Boolean) as SegmentInfo[];

      const originPlace = places.get(leg.origin_place_id);
      const destPlace = places.get(leg.destination_place_id);

      return {
        from: originPlace?.iata || String(leg.origin_place_id),
        to: destPlace?.iata || String(leg.destination_place_id),
        departure: leg.departure,
        arrival: leg.arrival,
        duration: leg.duration,
        stops: leg.stop_count || 0,
        segments: legSegments,
      };
    };

    const bookingUrl = itinerary.pricing_options?.[0]?.items?.[0]?.url;

    return {
      id: itinerary.id,
      price: cheapestPrice,
      currency: searchParams.currency,
      outbound: processLeg(outboundLeg),
      return: processLeg(returnLeg),
      bookingUrl: bookingUrl ? `https://www.skyscanner.com${bookingUrl}` : undefined,
    };
  });
}