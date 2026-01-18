import { NextResponse } from "next/server";
import { z } from "zod";

const SERPAPI_KEY = "c01f922edbef53faa5699a32ab4b1502dd87c40cb3f18cccda95e5376ca54682";

const ActivitySearchRequest = z.object({
  destination: z.string().min(1),
  activities: z.array(z.string()), // List of activity names to search prices for
  date: z.string().optional(), // Optional date for the activity
});

interface ActivityPrice {
  name: string;
  searchQuery: string;
  price: number | null;
  price_formatted: string;
  source: string;
  link?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  duration?: string;
  description?: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ActivitySearchRequest.parse(body);

    // Search for prices for each activity in parallel
    const pricePromises = parsed.activities.map((activity) =>
      searchActivityPrice(activity, parsed.destination)
    );

    const results = await Promise.all(pricePromises);

    return NextResponse.json({
      success: true,
      activities: results,
    });
  } catch (e: any) {
    console.error("Activity search error:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: e.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}

async function searchActivityPrice(
  activity: string,
  destination: string
): Promise<ActivityPrice> {
  const searchQuery = `${activity} ${destination}`;
  const priceSearchQuery = `${activity} ${destination} tickets price`;

  try {
    // First, search for the official website/link for this activity
    const searchUrl = new URL("https://serpapi.com/search.json");
    searchUrl.searchParams.set("engine", "google");
    searchUrl.searchParams.set("q", searchQuery);
    searchUrl.searchParams.set("api_key", SERPAPI_KEY);
    searchUrl.searchParams.set("num", "10");

    const searchRes = await fetch(searchUrl.toString());
    let officialLink: string | undefined;
    let officialSource: string = "Unknown";
    let foundPrice: number | null = null;
    let priceFormatted: string = "";
    let description: string | undefined;
    let rating: number | undefined;
    let reviews: number | undefined;
    let thumbnail: string | undefined;

    if (searchRes.ok) {
      const searchData = await searchRes.json();

      // Priority 1: Knowledge graph (most authoritative for places/businesses)
      if (searchData.knowledge_graph) {
        const kg = searchData.knowledge_graph;
        officialLink = kg.website || kg.reservation_link || kg.directions_link;
        officialSource = kg.title || activity;
        description = kg.description;
        if (kg.rating) rating = kg.rating;
        if (kg.reviews) reviews = kg.reviews;
        if (kg.price) {
          foundPrice = extractPrice(kg.price);
          priceFormatted = foundPrice ? `$${foundPrice}` : "Price varies";
        }
      }

      // Priority 2: Local results (Google Maps listings - great for restaurants, attractions)
      if (!officialLink && searchData.local_results?.places?.length > 0) {
        const place = searchData.local_results.places[0];
        officialLink = place.links?.website || place.link;
        officialSource = place.title || extractDomain(officialLink);
        rating = place.rating;
        reviews = place.reviews;
        thumbnail = place.thumbnail;
        if (place.price) {
          foundPrice = extractPrice(place.price);
          priceFormatted = foundPrice ? `$${foundPrice}` : place.price;
        }
      }

      // Priority 3: First organic result that looks like an official site
      if (!officialLink && searchData.organic_results?.length > 0) {
        // Try to find the official website (not aggregators like TripAdvisor, Yelp first)
        const officialSite = searchData.organic_results.find((r: any) => {
          const domain = extractDomain(r.link).toLowerCase();
          // Skip aggregator sites - we want the actual venue's site
          const isAggregator = /tripadvisor|yelp|expedia|booking\.com|viator|getyourguide|klook|timeout|thrillist|eater/i.test(domain);
          return !isAggregator;
        });
        
        if (officialSite) {
          officialLink = officialSite.link;
          officialSource = officialSite.source || extractDomain(officialSite.link);
          description = officialSite.snippet;
        } else {
          // Fall back to first result if no non-aggregator found
          const firstResult = searchData.organic_results[0];
          officialLink = firstResult.link;
          officialSource = firstResult.source || extractDomain(firstResult.link);
          description = firstResult.snippet;
        }
        
        // Check if any result has price in snippet
        for (const result of searchData.organic_results) {
          const priceMatch = (result.snippet || "").match(
            /\$(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s*(?:USD|dollars?)/i
          );
          if (priceMatch) {
            foundPrice = parseFloat(priceMatch[1] || priceMatch[2]);
            priceFormatted = `$${foundPrice}`;
            break;
          }
        }
      }
    }

    // If we haven't found a price yet, try Google Shopping
    if (!foundPrice) {
      const shoppingUrl = new URL("https://serpapi.com/search.json");
      shoppingUrl.searchParams.set("engine", "google_shopping");
      shoppingUrl.searchParams.set("q", priceSearchQuery);
      shoppingUrl.searchParams.set("api_key", SERPAPI_KEY);
      shoppingUrl.searchParams.set("num", "5");

      const shoppingRes = await fetch(shoppingUrl.toString());
      if (shoppingRes.ok) {
        const shoppingData = await shoppingRes.json();
        if (shoppingData.shopping_results?.length > 0) {
          const result = shoppingData.shopping_results[0];
          const price = extractPrice(result.price || result.extracted_price);
          if (price) {
            foundPrice = price;
            priceFormatted = `$${price}`;
            // Only use shopping link if we don't have a better one
            if (!officialLink) {
              officialLink = result.link;
              officialSource = result.source || "Booking";
            }
          }
        }
      }
    }

    // Fall back to estimated price if nothing found
    if (!foundPrice) {
      foundPrice = estimateActivityPrice(activity);
      priceFormatted = foundPrice ? `~$${foundPrice}` : "Free/Varies";
    }

    return {
      name: activity,
      searchQuery,
      price: foundPrice,
      price_formatted: priceFormatted,
      source: officialSource,
      link: officialLink,
      description,
      rating,
      reviews,
      thumbnail,
    };
  } catch (error) {
    console.error(`Error searching for ${activity}:`, error);
    const estimatedPrice = estimateActivityPrice(activity);
    return {
      name: activity,
      searchQuery,
      price: estimatedPrice,
      price_formatted: estimatedPrice ? `~$${estimatedPrice}` : "Free/Varies",
      source: "Estimated",
    };
  }
}

function extractPrice(priceStr: string | number | undefined): number | null {
  if (typeof priceStr === "number") return priceStr;
  if (!priceStr) return null;

  const match = String(priceStr).match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ""));
  }
  return null;
}

function extractDomain(url: string | undefined): string {
  if (!url) return "Unknown";
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

function estimateActivityPrice(activity: string): number | null {
  const lower = activity.toLowerCase();

  // Free activities
  if (
    /walk|stroll|wander|explore\s+(?:the\s+)?(?:streets?|neighborhood|area)|park|garden|beach|sunset|sunrise|window\s*shop/i.test(
      lower
    )
  ) {
    return 0;
  }

  // Museums and attractions
  if (/museum|gallery|exhibit/i.test(lower)) return 25;
  if (/temple|shrine|church|cathedral/i.test(lower)) return 10;
  if (/tower|observation|viewpoint|skydeck/i.test(lower)) return 35;
  if (/zoo|aquarium/i.test(lower)) return 30;
  if (/theme\s*park|amusement|disney|universal/i.test(lower)) return 100;

  // Food and dining
  if (/breakfast|brunch/i.test(lower)) return 20;
  if (/lunch|cafe|coffee/i.test(lower)) return 25;
  if (/dinner|restaurant|dining/i.test(lower)) return 50;
  if (/street\s*food|market|food\s*stall/i.test(lower)) return 15;
  if (/fine\s*dining|michelin/i.test(lower)) return 150;
  if (/bar|cocktail|drinks?|nightlife/i.test(lower)) return 40;

  // Tours and experiences
  if (/tour|guided/i.test(lower)) return 45;
  if (/cooking\s*class|workshop/i.test(lower)) return 80;
  if (/spa|massage|wellness/i.test(lower)) return 100;
  if (/cruise|boat/i.test(lower)) return 60;

  // Activities
  if (/hik(?:e|ing)|trek/i.test(lower)) return 0;
  if (/bike|cycling|rental/i.test(lower)) return 30;
  if (/snorkel|dive|diving/i.test(lower)) return 80;
  if (/surf(?:ing)?|lesson/i.test(lower)) return 70;

  // Shopping (no fixed price)
  if (/shop|shopping|market|mall/i.test(lower)) return null;

  // Default estimate for unknown activities
  return 25;
}
