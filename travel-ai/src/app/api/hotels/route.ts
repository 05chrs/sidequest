import { NextResponse } from "next/server";
import { z } from "zod";

const HotelSearchRequest = z.object({
  city_id: z.string(),
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  number_of_rooms: z.number().min(1).max(10),
  number_of_adults: z.number().min(1).max(20),
  number_of_children: z.number().min(0).max(10),
  currency: z.string().length(3),
});

const HOTEL_API_KEY = "696bf3c39a4234b73f7b59bb";

export async function POST(req: Request) {
  try {
    const body = HotelSearchRequest.parse(await req.json());
    const params = new URLSearchParams({
      api_key: HOTEL_API_KEY,
      cityid: body.city_id,
      pagination: "0",
      cur: body.currency,
      rooms: String(body.number_of_rooms),
      adults: String(body.number_of_adults),
      checkin: body.checkin_date,
      checkout: body.checkout_date,
      tax: "true",
    });
    if (body.number_of_children > 0) {
      params.append("children", String(body.number_of_children));
    }
    const url = `https://api.makcorps.com/city?${params.toString()}`;
    console.log("Calling Hotel API:", url);
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Hotel API error: ${response.status}` }, { status: response.status });
    }
    const data = await response.json();
    const hotels = processHotels(data, body.currency);
    return NextResponse.json({ success: true, hotels });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function processHotels(data: any[], currency: string) {
  if (!Array.isArray(data)) return [];
  return data
    .filter((h: any) => h.name && h.hotelId)
    .map((h: any) => {
      const prices: any[] = [];
      for (let i = 1; i <= 4; i++) {
        if (h[`vendor${i}`] && h[`price${i}`]) {
          const p = parseFloat(h[`price${i}`].replace(/[^0-9.]/g, "")) || 0;
          // Only include prices that are greater than 0
          if (p > 0) {
            prices.push({ vendor: h[`vendor${i}`], price: p, priceFormatted: h[`price${i}`] });
          }
        }
      }
      prices.sort((a, b) => a.price - b.price);
      return {
        id: String(h.hotelId), name: h.name, rating: h.reviews?.rating || 0,
        reviewCount: h.reviews?.count || 0, prices,
        lowestPrice: prices[0]?.price || 0, lowestPriceVendor: prices[0]?.vendor || "", currency
      };
    })
    // Filter out hotels with $0 or no valid prices
    .filter((h) => h.lowestPrice > 0)
    .sort((a, b) => a.lowestPrice - b.lowestPrice)
    .slice(0, 15);
}
