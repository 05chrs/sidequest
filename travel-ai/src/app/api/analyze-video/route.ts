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

interface CaptionData {
  caption: string;
  author?: string;
  title?: string;
  hashtags: string[];
  mentions: string[];
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

    // Step 1: Extract caption/description from the social media post
    let captionData: CaptionData | null = null;
    try {
      captionData = await extractCaption(videoUrl, platform);
      console.log("Extracted caption data:", captionData);
    } catch (error) {
      console.warn("Could not extract caption:", error);
    }

    // Step 2: Extract actual video URL from Instagram/TikTok if needed
    // Social media URLs may need to be converted to direct video links
    try {
      videoUrl = await extractVideoUrl(videoUrl, platform);
    } catch (error) {
      console.warn("Could not extract direct video URL, using original:", error);
      // Continue with original URL - Overshoot or fallback may handle it
    }
    
    // Step 3: Analyze video with Overshoot AI (include caption for context)
    // Adjust the API endpoint and request format based on Overshoot's actual API
    const overshootResponse = await analyzeWithOvershoot(
      videoUrl,
      overshootApiKey,
      platform,
      captionData
    );

    // Step 4: Process Overshoot results to extract location information
    const locationData = extractLocations(overshootResponse);

    // Step 5: Enhance location data with geocoding if needed
    const enhancedLocations = await enhanceLocations(locationData);

    return NextResponse.json({
      success: true,
      videoUrl,
      platform,
      locations: enhancedLocations,
      detectedText: overshootResponse.detectedText || [],
      sceneDescription: overshootResponse.sceneDescription || "",
      suggestedDestination: overshootResponse.suggestedDestination,
      // Include caption data in response
      caption: captionData?.caption || null,
      author: captionData?.author || null,
      hashtags: captionData?.hashtags || [],
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
 * Extract caption/description from Instagram Reel or TikTok video
 * Uses oEmbed APIs which don't require authentication
 */
async function extractCaption(url: string, platform: "instagram" | "tiktok"): Promise<CaptionData> {
  let caption = "";
  let author = "";
  let title = "";

  if (platform === "instagram") {
    // Instagram oEmbed API
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
    try {
      const response = await fetch(oembedUrl, {
        headers: { "Accept": "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        caption = data.title || "";
        author = data.author_name || "";
      }
    } catch (e) {
      console.warn("Instagram oEmbed failed:", e);
    }
  } else if (platform === "tiktok") {
    // TikTok oEmbed API
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    try {
      const response = await fetch(oembedUrl, {
        headers: { "Accept": "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        title = data.title || "";
        author = data.author_name || "";
        caption = title; // TikTok uses title field for caption
      }
    } catch (e) {
      console.warn("TikTok oEmbed failed:", e);
    }
  }

  // Extract hashtags from caption
  const hashtagRegex = /#[\w\u0080-\uFFFF]+/g;
  const hashtags = caption.match(hashtagRegex) || [];

  // Extract mentions from caption
  const mentionRegex = /@[\w\u0080-\uFFFF]+/g;
  const mentions = caption.match(mentionRegex) || [];

  return {
    caption,
    author,
    title,
    hashtags: hashtags.map(h => h.toLowerCase()),
    mentions,
  };
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
  platform: string,
  captionData?: CaptionData | null
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

  // Build caption context for the prompt
  let captionContext = "";
  if (captionData) {
    if (captionData.caption) {
      captionContext += `\n\nVideo Caption: "${captionData.caption}"`;
    }
    if (captionData.author) {
      captionContext += `\nPosted by: @${captionData.author}`;
    }
    if (captionData.hashtags.length > 0) {
      captionContext += `\nHashtags: ${captionData.hashtags.join(", ")}`;
    }
    if (captionData.mentions.length > 0) {
      captionContext += `\nMentions: ${captionData.mentions.join(", ")}`;
    }
  }

  // Combined prompt for location detection
  const locationPrompt = `Analyze this video to identify locations and places:${captionContext}

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
    return await fallbackAnalysisWithOpenAI(videoUrl, captionData);
  }
}

async function fallbackAnalysisWithOpenAI(videoUrl: string, captionData?: CaptionData | null): Promise<OvershootAnalysisResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("Neither OVERSHOOT_API_KEY nor OPENAI_API_KEY is configured");
  }

  // Build caption context
  let captionContext = "";
  if (captionData) {
    if (captionData.caption) {
      captionContext += `\n\nVideo Caption: "${captionData.caption}"`;
    }
    if (captionData.author) {
      captionContext += `\nPosted by: @${captionData.author}`;
    }
    if (captionData.hashtags.length > 0) {
      captionContext += `\nHashtags found: ${captionData.hashtags.join(", ")}`;
    }
    if (captionData.mentions.length > 0) {
      captionContext += `\nMentions: ${captionData.mentions.join(", ")}`;
    }
  }

  // Fallback: Use OpenAI to analyze video metadata and generate location suggestions
  // Note: Full video frame analysis would require extracting frames and using Vision API
  const systemPrompt = `You are a location detection expert. Analyze video content URLs, captions, and hashtags to identify locations.

When given a video URL (Instagram Reel, TikTok, etc.) and its caption, analyze it based on:
1. The video caption - this often contains location names, city names, or place descriptions
2. Hashtags - look for location-specific hashtags like #tokyo, #paris, #bali, etc.
3. Mentions - tagged accounts may be local businesses or locations
4. URL patterns and embedded metadata if available
5. Context clues from the platform and typical content

IMPORTANT: The caption and hashtags are the most reliable source of location information. Pay close attention to them!

Return a JSON object with this exact structure:
{
  "locations": [
    {
      "name": "string (location name)",
      "description": "string (why this location was identified)",
      "confidence": number (0-1),
      "type": "landmark" | "business" | "area" | "region"
    }
  ],
  "detectedText": ["array", "of", "relevant", "text", "from", "caption"],
  "sceneDescription": "string (overall description based on caption and context)",
  "suggestedDestination": "string (most likely city/region based on all clues)"
}`;

  const userMessage = captionContext 
    ? `Analyze this video URL and its caption for locations: ${videoUrl}${captionContext}

Use the caption and hashtags as your PRIMARY source for identifying the location. They typically contain the most accurate location information.`
    : `Analyze this video URL for locations: ${videoUrl}

Note: No caption was available. Make reasonable inferences based on:
- The URL structure (Instagram/TikTok patterns)
- Common travel video content patterns
- Typical location indicators in social media travel videos`;

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
        { role: "user", content: userMessage },
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
