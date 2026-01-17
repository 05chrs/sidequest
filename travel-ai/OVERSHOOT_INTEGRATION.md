# Overshoot AI Integration Guide

This document describes the Overshoot AI integration for video analysis and location detection in the travel AI application.

## Implementation Summary

### ✅ Step 1: API Endpoint Updated
- **Endpoint**: `https://cluster1.overshoot.ai/api/v0.2/analyze`
- **Configurable**: Set `OVERSHOOT_API_URL` in `.env.local` to override
- **Request Method**: POST with JSON body

### ✅ Step 2: Request/Response Format
- **Output Schema**: Structured JSON schema for location detection
- **Request Format**:
  ```json
  {
    "source": "video_url",
    "prompt": "location_detection_prompt",
    "outputSchema": { ... },
    "model": "vision"
  }
  ```
- **Response Handling**: Parses both structured JSON responses and string-based results

### ✅ Step 3: Testing Support
- Test script: `test-video-api.sh`
- Documentation in README.md
- Support for both Instagram Reels and TikTok URLs

## API Route: `/api/analyze-video/route.ts`

### Features
1. **Platform Detection**: Automatically detects Instagram vs TikTok URLs
2. **Video URL Extraction**: Placeholder for extracting direct video URLs (ready for production implementation)
3. **Overshoot Integration**: Calls Overshoot AI with proper schema
4. **OpenAI Fallback**: Falls back to OpenAI if Overshoot is unavailable
5. **Structured Output**: Returns consistent format with locations, detected text, scene description

### Environment Variables

Required in `.env.local`:
```env
OVERSHOOT_API_KEY=your_api_key_here
OPENAI_API_KEY=your_openai_key_here  # For fallback
OVERSHOOT_API_URL=https://cluster1.overshoot.ai/api/v0.2  # Optional
```

### Request Format

```json
{
  "videoUrl": "https://www.instagram.com/reel/EXAMPLE/",
  "platform": "instagram"  // optional: "instagram" | "tiktok"
}
```

### Response Format

```json
{
  "success": true,
  "videoUrl": "...",
  "platform": "instagram",
  "locations": [
    {
      "name": "Location Name",
      "description": "Description",
      "confidence": 0.85,
      "type": "landmark" | "business" | "area" | "region",
      "coordinates": {  // optional
        "lat": 40.7128,
        "lng": -74.0060
      }
    }
  ],
  "detectedText": ["text", "found", "in", "video"],
  "sceneDescription": "Overall scene description",
  "suggestedDestination": "City/Region Name"
}
```

## Testing

### Manual Testing via UI
1. Start the dev server: `npm run dev`
2. Navigate to the app in your browser
3. Click on the "Video Itinerary" tab
4. Paste an Instagram Reel or TikTok URL
5. Click "Analyze Video"

### API Testing via cURL
```bash
curl -X POST http://localhost:3000/api/analyze-video \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.instagram.com/reel/EXAMPLE/",
    "platform": "instagram"
  }'
```

### Using Test Script
```bash
./test-video-api.sh [INSTAGRAM_URL] [TIKTOK_URL]
```

Or use default test URLs:
```bash
./test-video-api.sh
```

## Production Considerations

### Video URL Extraction
The current `extractVideoUrl()` function is a placeholder. For production, implement:

- **Instagram**: Use Instagram Graph API or Basic Display API
- **TikTok**: Use TikTok API or extract from page HTML
- **Alternative**: Use libraries like `yt-dlp` for public content extraction

### Overshoot API Configuration
- Verify the API endpoint matches your Overshoot cluster
- Adjust `outputSchema` if Overshoot API requirements differ
- Handle streaming responses if Overshoot uses streaming mode

### Error Handling
- Gracefully handles Overshoot API failures
- Falls back to OpenAI for analysis
- Provides clear error messages to users

## Next Steps

1. **Get Overshoot API Key**: Obtain API credentials from Overshoot AI
2. **Test with Real URLs**: Test with actual Instagram Reels and TikTok videos
3. **Implement Video Extraction**: Add production video URL extraction for social media platforms
4. **Refine Schema**: Adjust `outputSchema` based on actual Overshoot API responses
5. **Add Geocoding**: Implement geocoding service to get coordinates for detected locations

## Troubleshooting

### "Missing OVERSHOOT_API_KEY"
- Ensure `.env.local` exists in the project root
- Add `OVERSHOOT_API_KEY=your_key_here`
- Restart the dev server after adding environment variables

### "Overshoot API endpoint not available"
- Check if the API URL is correct
- Verify your API key is valid
- Check Overshoot AI documentation for current endpoint format
- The system will automatically fall back to OpenAI if Overshoot fails

### "Failed to analyze video"
- Check that the video URL is accessible (public content)
- Verify the URL format is correct
- Check browser console and server logs for detailed errors
