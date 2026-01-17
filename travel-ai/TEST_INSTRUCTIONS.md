# Testing Steps - Overshoot AI Integration

## Step 1: Set up environment variables

Create or update `.env.local` in the project root with:

```env
OVERSHOOT_API_KEY=ovs_15e62761833cf12654e688a5b37e3362
OVERSHOOT_API_URL=https://cluster1.overshoot.ai/api/v0.2
```

**Important**: After creating/updating `.env.local`, restart the dev server for changes to take effect.

To create the file, run:
```bash
cd /Users/ana/Sidequest/travel-ai
cat > .env.local << EOF
OVERSHOOT_API_KEY=ovs_15e62761833cf12654e688a5b37e3362
OVERSHOOT_API_URL=https://cluster1.overshoot.ai/api/v0.2
EOF
```

## Step 2: Test via UI

1. Make sure dev server is running:
   ```bash
   npm run dev
   ```

2. Open browser: http://localhost:3000 or http://localhost:3001

3. Click on the "🎥 Video Itinerary" tab

4. Paste an Instagram Reel or TikTok URL, for example:
   - Instagram: `https://www.instagram.com/reel/EXAMPLE/`
   - TikTok: `https://www.tiktok.com/@username/video/1234567890`

5. Click "Analyze Video"

6. You should see:
   - Detected locations with confidence scores
   - Scene description
   - Generated itinerary (if locations were detected)

## Step 3: Test via API

### Option A: Using the test script

```bash
cd /Users/ana/Sidequest/travel-ai
./test-video-api.sh
```

Or with specific URLs:
```bash
./test-video-api.sh "https://www.instagram.com/reel/YOUR_REEL_ID/" "https://www.tiktok.com/@username/video/1234567890"
```

### Option B: Using cURL directly

```bash
# Test Instagram Reel
curl -X POST http://localhost:3001/api/analyze-video \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.instagram.com/reel/EXAMPLE/",
    "platform": "instagram"
  }' | jq '.'

# Test TikTok Video
curl -X POST http://localhost:3001/api/analyze-video \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.tiktok.com/@example/video/1234567890",
    "platform": "tiktok"
  }' | jq '.'
```

### Expected API Response

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
      "type": "landmark"
    }
  ],
  "detectedText": ["text", "from", "video"],
  "sceneDescription": "Overall scene description",
  "suggestedDestination": "City/Region Name"
}
```

## Troubleshooting

- **"Missing OVERSHOOT_API_KEY"**: Ensure `.env.local` exists and has the correct key, then restart the dev server
- **"Overshoot API error"**: The system will fall back to OpenAI if Overshoot is unavailable
- **Port conflicts**: If 3000 is in use, the server will use 3001 (check terminal output)
