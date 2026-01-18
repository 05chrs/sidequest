import { NextResponse } from "next/server";
import { z } from "zod";

const SERPAPI_KEY = "019ddfecd936f26a96e26dc2f43c05860339d1b0952dcb99b855aa5e65733f05";

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
  const searchQuery = `${activity} ${destination} tickets price`;

  try {
    // First try Google Shopping for ticket prices
    const shoppingUrl = new URL("https://serpapi.com/search.json");
    shoppingUrl.searchParams.set("engine", "google_shopping");
    shoppingUrl.searchParams.set("q", searchQuery);
    shoppingUrl.searchParams.set("api_key", SERPAPI_KEY);
    shoppingUrl.searchParams.set("num", "5");

    const shoppingRes = await fetch(shoppingUrl.toString());
    if (shoppingRes.ok) {
      const shoppingData = await shoppingRes.json();
      if (shoppingData.shopping_results?.length > 0) {
        const result = shoppingData.shopping_results[0];
        const price = extractPrice(result.price || result.extracted_price);
        if (price) {
          return {
            name: activity,
            searchQuery,
            price,
            price_formatted: `$${price}`,
            source: result.source || "Google Shopping",
            link: result.link,
            thumbnail: result.thumbnail,
            rating: result.rating,
            reviews: result.reviews,
          };
        }
      }
    }

    // Fallback to regular Google search for prices
    const searchUrl = new URL("https://serpapi.com/search.json");
    searchUrl.searchParams.set("engine", "google");
    searchUrl.searchParams.set("q", searchQuery);
    searchUrl.searchParams.set("api_key", SERPAPI_KEY);
    searchUrl.searchParams.set("num", "10");

    const searchRes = await fetch(searchUrl.toString());
    if (searchRes.ok) {
      const searchData = await searchRes.json();

      // Check for knowledge graph pricing
      if (searchData.knowledge_graph?.price) {
        const price = extractPrice(searchData.knowledge_graph.price);
        return {
          name: activity,
          searchQuery,
          price,
          price_formatted: price ? `$${price}` : "Price varies",
          source: "Google",
          link: searchData.knowledge_graph.website,
          description: searchData.knowledge_graph.description,
        };
      }

      // Check organic results for price mentions
      for (const result of searchData.organic_results || []) {
        const priceMatch = (result.snippet || "").match(
          /\$(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s*(?:USD|dollars?)/i
        );
        if (priceMatch) {
          const price = parseFloat(priceMatch[1] || priceMatch[2]);
          return {
            name: activity,
            searchQuery,
            price,
            price_formatted: `$${price}`,
            source: result.source || extractDomain(result.link),
            link: result.link,
            description: result.snippet,
          };
        }
      }

      // Check local results (like Google Maps listings)
      if (searchData.local_results?.places) {
        for (const place of searchData.local_results.places) {
          if (place.price) {
            const price = extractPrice(place.price);
            return {
              name: activity,
              searchQuery,
              price,
              price_formatted: price ? `$${price}` : place.price,
              source: "Google Maps",
              link: place.link,
              rating: place.rating,
              reviews: place.reviews,
              thumbnail: place.thumbnail,
            };
          }
        }
      }
    }

    // Return estimated prices for common activity types
    const estimatedPrice = estimateActivityPrice(activity);
    return {
      name: activity,
      searchQuery,
      price: estimatedPrice,
      price_formatted: estimatedPrice ? `~$${estimatedPrice}` : "Free/Varies",
      source: "Estimated",
    };
  } catch (error) {
    console.error(`Error searching price for ${activity}:`, error);
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
