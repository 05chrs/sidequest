This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Environment Variables

Create a `.env.local` file in the root directory:

```env
OVERSHOOT_API_KEY=your_overshoot_api_key_here
OVERSHOOT_API_URL=https://cluster1.overshoot.ai/api/v0.2  # Optional: defaults to cluster1
OPENAI_API_KEY=your_openai_api_key_here  # Fallback for video analysis
```

## Features

### Flight Search
- Natural language flight search
- Round-trip flight booking
- Flight parameter extraction from conversation

### Video-Based Itinerary Planning
- Analyze Instagram Reels and TikTok videos for locations
- Automatic location detection using Overshoot AI
- Generate travel itineraries from detected locations
- Uses OpenAI as fallback if Overshoot is unavailable

## Testing Video Analysis

### Test with Instagram Reels
1. Copy an Instagram Reel URL (e.g., `https://www.instagram.com/reel/ABC123/`)
2. Go to the "Video Itinerary" tab in the app
3. Paste the URL and click "Analyze Video"
4. The system will detect locations and generate an itinerary

### Test with TikTok Videos
1. Copy a TikTok URL (e.g., `https://www.tiktok.com/@username/video/1234567890`)
2. Follow the same steps as above

### API Testing
You can test the API endpoint directly using curl:

```bash
curl -X POST http://localhost:3000/api/analyze-video \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.instagram.com/reel/EXAMPLE/",
    "platform": "instagram"
  }'
```

### Expected Response
```json
{
  "success": true,
  "videoUrl": "...",
  "platform": "instagram",
  "locations": [
    {
      "name": "Location Name",
      "description": "Description of what was seen",
      "confidence": 0.85,
      "type": "landmark"
    }
  ],
  "detectedText": ["text", "from", "video"],
  "sceneDescription": "Overall scene description",
  "suggestedDestination": "City/Region Name"
}
```

## Notes

- **Overshoot AI Integration**: The app uses Overshoot AI for video analysis. If the Overshoot API is unavailable or not configured, it falls back to OpenAI.
- **Video URL Extraction**: Instagram and TikTok URLs may need to be converted to direct video links. The current implementation attempts to handle this, but you may need to implement platform-specific extraction for production use.
- **API Endpoint**: The Overshoot API endpoint is configurable via `OVERSHOOT_API_URL` environment variable (defaults to `https://cluster1.overshoot.ai/api/v0.2`).
