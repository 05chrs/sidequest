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
  } catch (e) {
    console.error("Video analysis error:", e);

    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: e.issues },
        { status: 400 }
      );
    }

    const message =
      e instanceof Error ? e.message : "Unknown error during video analysis";

    return NextResponse.json({ error: message }, { status: 500 });
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
async function extractCaption(
  url: string,
  platform: "instagram" | "tiktok"
): Promise<CaptionData> {
  let caption = "";
  let author = "";
  let title = "";

  if (platform === "instagram") {
    // Instagram oEmbed API
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(
      url
    )}`;
    try {
      const response = await fetch(oembedUrl, {
        headers: { Accept: "application/json" },
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
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
      url
    )}`;
    try {
      const response = await fetch(oembedUrl, {
        headers: { Accept: "application/json" },
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
    hashtags: hashtags.map((h) => h.toLowerCase()),
    mentions,
  };
}

/**
 * Extract direct video URL from Instagram Reel or TikTok page
 * Placeholder: returns original URL. (Real extraction requires official APIs or scraping.)
 */
async function extractVideoUrl(
  url: string,
  platform: "instagram" | "tiktok"
): Promise<string> {
  if (url.match(/\.(mp4|mov|avi|webm|m3u8)/i)) {
    return url;
  }

  console.log(`Extracting video URL from ${platform}: ${url}`);
  return url;
}

async function analyzeWithOvershoot(
  videoUrl: string,
  apiKey: string,
  platform: string,
  captionData?: CaptionData | null
): Promise<OvershootAnalysisResult> {
  const overshootApiUrl =
    process.env.OVERSHOOT_API_URL || "https://cluster1.overshoot.ai/api/v0.2";

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
              enum: ["landmark", "business", "area", "region"],
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

  const locationPrompt = `Analyze this video to identify locations and places:${captionContext}

1. Identify any landmarks, famous buildings, or recognizable locations visible
2. Extract place names, city names, or location names from visible text or signs
3. Describe the scene and environment (urban, nature, beach, mountains, etc.)
4. Identify business names, restaurants, or venue names visible
5. Determine the most likely destination city or region based on visual cues

Return structured information about all detected locations with confidence scores.`;

  try {
    const response = await fetch(`${overshootApiUrl}/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: videoUrl,
        prompt: locationPrompt,
        outputSchema,
        model: "vision",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        console.warn(
          "Overshoot REST API endpoint not found, trying alternative approach"
        );
        throw new Error("Overshoot API endpoint not available - using fallback");
      }
      throw new Error(`Overshoot API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    let result: any;
    if (data.result) {
      try {
        result = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      } catch {
        result = data;
      }
    } else {
      result = data;
    }

    return {
      locations: result.locations || [],
      detectedText: result.detectedText || result.detected_text || [],
      sceneDescription: result.sceneDescription || result.scene_description || "",
      suggestedDestination:
        result.suggestedDestination || result.suggested_destination,
    };
  } catch (error: any) {
    console.warn("Overshoot API error, falling back to OpenAI:", error.message);
    return await fallbackAnalysisWithOpenAI(videoUrl, captionData);
  }
}

async function fallbackAnalysisWithOpenAI(
  videoUrl: string,
  captionData?: CaptionData | null
): Promise<OvershootAnalysisResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("Neither OVERSHOOT_API_KEY nor OPENAI_API_KEY is configured");
  }

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
      Authorization: `Bearer ${openaiKey}`,
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

  let content: any;
  try {
    content =
      typeof data.choices[0].message.content === "string"
        ? JSON.parse(data.choices[0].message.content)
        : data.choices[0].message.content;
  } catch {
    throw new Error("Failed to parse OpenAI response as JSON");
  }

  return {
    locations: content.locations || [],
    detectedText: content.detectedText || content.detected_text || [],
    sceneDescription: content.sceneDescription || content.scene_description || "",
    suggestedDestination: content.suggestedDestination || content.suggested_destination,
  };
}

function extractLocations(
  analysis: OvershootAnalysisResult
): OvershootAnalysisResult["locations"] {
  return analysis.locations || [];
}

async function enhanceLocations(
  locations: OvershootAnalysisResult["locations"]
): Promise<OvershootAnalysisResult["locations"]> {
  return locations;
}