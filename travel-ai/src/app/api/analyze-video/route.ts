import { NextResponse } from "next/server";
import { z } from "zod";

const VideoAnalysisRequest = z.object({
  videoUrl: z.string().url(),
  platform: z.enum(["instagram", "tiktok"]).optional(),
});

interface OvershootAnalysisResult {
  locations: Array<{
    name: string;
    description: string;
    confidence: number;
    type: "landmark" | "business" | "area" | "region";
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  }>;
  detectedText: string[];
  sceneDescription: string;
  suggestedDestination?: string;
}

export async function POST(req: Request) {
  try {
    const body = VideoAnalysisRequest.parse(await req.json());
    
    const overshootApiKey = process.env.OVERSHOOT_API_KEY;
    if (!overshootApiKey) {
      return NextResponse.json(
        { error: "Missing OVERSHOOT_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Extract video URL and determine platform
    let videoUrl = body.videoUrl;
    const platform = body.platform || detectPlatform(videoUrl);

    // Step 1: Extract actual video URL from Instagram/TikTok if needed
    // Social media URLs may need to be converted to direct video links
    try {
      videoUrl = await extractVideoUrl(videoUrl, platform);
    } catch (error) {
      console.warn("Could not extract direct video URL, using original:", error);
      // Continue with original URL - Overshoot or fallback may handle it
    }
    
    // Step 2: Analyze video with Overshoot AI
    // Adjust the API endpoint and request format based on Overshoot's actual API
    const overshootResponse = await analyzeWithOvershoot(
      videoUrl,
      overshootApiKey,
      platform
    );

    // Step 3: Process Overshoot results to extract location information
    const locationData = extractLocations(overshootResponse);

    // Step 4: Enhance location data with geocoding if needed
    const enhancedLocations = await enhanceLocations(locationData);

    return NextResponse.json({
      success: true,
      videoUrl,
      platform,
      locations: enhancedLocations,
      detectedText: overshootResponse.detectedText || [],
      sceneDescription: overshootResponse.sceneDescription || "",
      suggestedDestination: overshootResponse.suggestedDestination,
    });
  } catch (e: any) {
    console.error("Video analysis error:", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: e.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: e.message || "Unknown error during video analysis" },
      { status: 500 }
    );
  }
}

function detectPlatform(url: string): "instagram" | "tiktok" {
  if (url.includes("instagram.com") || url.includes("reel")) {
    return "instagram";
  }
  if (url.includes("tiktok.com")) {
    return "tiktok";
  }
  return "instagram"; // default
}

/**
 * Extract direct video URL from Instagram Reel or TikTok page
 * This is a helper function - in production, you may need:
 * - Instagram Graph API (for official access)
 * - TikTok API (for official access)
 * - Or a service like youtube-dl / yt-dlp for public content
 */
async function extractVideoUrl(url: string, platform: "instagram" | "tiktok"): Promise<string> {
  // For now, return the original URL
  // In production, implement:
  // - Instagram: Use Instagram Basic Display API or Graph API to get video URL
  // - TikTok: Use TikTok API or extract from page HTML/embed
  // - Or use a library like 'yt-dlp' or similar for public content extraction
  
  // Placeholder: If URL already looks like a direct video file, return it
  if (url.match(/\.(mp4|mov|avi|webm|m3u8)/i)) {
    return url;
  }
  
  // For Instagram/TikTok URLs, we'd need to fetch the page and extract video source
  // This is a simplified version - implement actual extraction as needed
  console.log(`Extracting video URL from ${platform}: ${url}`);
  
  return url; // Return original for now
}

async function analyzeWithOvershoot(
  videoUrl: string,
  apiKey: string,
  platform: string
): Promise<OvershootAnalysisResult> {
  // Overshoot AI API endpoint (adjust cluster if needed)
  const overshootApiUrl = process.env.OVERSHOOT_API_URL || "https://cluster1.overshoot.ai/api/v0.2";
  
  // Define output schema for structured location detection
  const outputSchema = {
    type: "object",
    properties: {
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            type: { 
              type: "string",
              enum: ["landmark", "business", "area", "region"]
            },
          },
          required: ["name", "confidence", "type"],
        },
      },
      detectedText: {
        type: "array",
        items: { type: "string" },
      },
      sceneDescription: { type: "string" },
      suggestedDestination: { type: "string" },
    },
    required: ["locations", "sceneDescription"],
  };

  // Combined prompt for location detection
  const locationPrompt = `Analyze this video to identify locations and places:

1. Identify any landmarks, famous buildings, or recognizable locations visible
2. Extract place names, city names, or location names from visible text or signs
3. Describe the scene and environment (urban, nature, beach, mountains, etc.)
4. Identify business names, restaurants, or venue names visible
5. Determine the most likely destination city or region based on visual cues

Return structured information about all detected locations with confidence scores.`;

  try {
    // Try REST API approach first (if Overshoot supports it)
    // Note: Overshoot primarily uses SDK with streaming, but we'll try REST first
    const response = await fetch(`${overshootApiUrl}/analyze`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: videoUrl,
        prompt: locationPrompt,
        outputSchema: outputSchema,
        model: "vision", // Adjust based on available models
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If endpoint doesn't exist, try alternative format
      if (response.status === 404) {
        console.warn("Overshoot REST API endpoint not found, trying alternative approach");
        throw new Error("Overshoot API endpoint not available - using fallback");
      }
      throw new Error(`Overshoot API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Handle both structured output (with schema) and raw result format
    let result;
    if (data.result) {
      // If result is a string (JSON), parse it
      try {
        result = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      } catch {
        result = data;
      }
    } else {
      result = data;
    }
    
    // Map Overshoot response to our format
    return {
      locations: result.locations || [],
      detectedText: result.detectedText || result.detected_text || [],
      sceneDescription: result.sceneDescription || result.scene_description || "",
      suggestedDestination: result.suggestedDestination || result.suggested_destination,
    };
  } catch (error: any) {
    // If Overshoot API fails, fall back to OpenAI for analysis
    console.warn("Overshoot API error, falling back to OpenAI:", error.message);
    return await fallbackAnalysisWithOpenAI(videoUrl);
  }
}

async function fallbackAnalysisWithOpenAI(videoUrl: string): Promise<OvershootAnalysisResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("Neither OVERSHOOT_API_KEY nor OPENAI_API_KEY is configured");
  }

  // Fallback: Use OpenAI to analyze video metadata and generate location suggestions
  // Note: Full video frame analysis would require extracting frames and using Vision API
  const systemPrompt = `You are a location detection expert. Analyze video content URLs and descriptions to identify locations.

When given a video URL (Instagram Reel, TikTok, etc.), analyze it based on:
1. URL patterns and embedded metadata if available
2. Common location indicators in social media videos
3. Context clues from the platform and typical content

Return a JSON object with this exact structure:
{
  "locations": [
    {
      "name": "string (location name)",
      "description": "string (what was seen)",
      "confidence": number (0-1),
      "type": "landmark" | "business" | "area" | "region"
    }
  ],
  "detectedText": ["array", "of", "text", "found"],
  "sceneDescription": "string (overall scene description)",
  "suggestedDestination": "string (suggested city/region)"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this video URL for locations: ${videoUrl}

Note: Since I cannot directly view the video frames, make reasonable inferences based on:
- The URL structure (Instagram/TikTok patterns)
- Common travel video content patterns
- Typical location indicators in social media travel videos

If the URL contains location hashtags, geotags, or other metadata indicators, use those as clues.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI fallback analysis failed: ${errorText}`);
  }

  const data = await response.json();
  let content;
  
  try {
    content = typeof data.choices[0].message.content === "string" 
      ? JSON.parse(data.choices[0].message.content)
      : data.choices[0].message.content;
  } catch (e) {
    throw new Error("Failed to parse OpenAI response as JSON");
  }

  return {
    locations: content.locations || [],
    detectedText: content.detectedText || content.detected_text || [],
    sceneDescription: content.sceneDescription || content.scene_description || "",
    suggestedDestination: content.suggestedDestination || content.suggested_destination,
  };
}

function extractLocations(analysis: OvershootAnalysisResult): OvershootAnalysisResult["locations"] {
  return analysis.locations || [];
}

async function enhanceLocations(
  locations: OvershootAnalysisResult["locations"]
): Promise<OvershootAnalysisResult["locations"]> {
  // Optionally geocode locations to get coordinates
  // This could use Google Maps Geocoding API or similar
  // For now, return locations as-is
  return locations;
}
