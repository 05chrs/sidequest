import { NextResponse } from "next/server";
import { z } from "zod";

const SERPAPI_KEY = "019ddfecd936f26a96e26dc2f43c05860339d1b0952dcb99b855aa5e65733f05";

const CityImageRequest = z.object({
  city: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = CityImageRequest.parse(body);

    // Search for city skyline/cityscape image
    const searchUrl = new URL("https://serpapi.com/search.json");
    searchUrl.searchParams.set("engine", "google_images");
    searchUrl.searchParams.set("q", `${parsed.city} cityscape skyline beautiful`);
    searchUrl.searchParams.set("api_key", SERPAPI_KEY);
    searchUrl.searchParams.set("num", "5");
    searchUrl.searchParams.set("safe", "active");
    searchUrl.searchParams.set("tbs", "isz:l"); // Large images only

    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      throw new Error(`SerpAPI error: ${response.status}`);
    }

    const data = await response.json();
    
    // Find a good quality image
    const images = data.images_results || [];
    
    for (const img of images) {
      // Prefer original images that are likely high quality
      const imageUrl = img.original || img.thumbnail;
      if (imageUrl && !imageUrl.includes("x-raw-image") && !imageUrl.includes("encrypted")) {
        return NextResponse.json({
          success: true,
          imageUrl: imageUrl,
          thumbnail: img.thumbnail,
          source: img.source,
        });
      }
    }

    // Fallback to first available image
    if (images.length > 0) {
      return NextResponse.json({
        success: true,
        imageUrl: images[0].original || images[0].thumbnail,
        thumbnail: images[0].thumbnail,
        source: images[0].source,
      });
    }

    return NextResponse.json({
      success: false,
      error: "No images found",
    });
  } catch (e: any) {
    console.error("City image search error:", e);
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
