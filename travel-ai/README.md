# Sidequest - AI Travel Itinerary Planner

Sidequest is an AI-powered travel planning application that generates personalized trip itineraries based on your preferences, social media travel videos, and natural language requests.

## Features

- **Natural Language Trip Planning**: Describe your dream trip in plain English and get a detailed day-by-day itinerary
- **Video Integration**: Add Instagram Reels or TikTok videos of places you want to visit, and the AI will extract locations and incorporate them into your itinerary
- **Flight Search**: Get real-time flight prices and options for your trip
- **Hotel Recommendations**: Browse hotel options with pricing, filtered by your preferences (no hostels, luxury only, etc.)
- **Activity Pricing**: See estimated costs for activities with links to official booking sites
- **Smart Reprompting**: If you forget to include dates or destination, the app will ask for the missing information
- **Cost Calculator**: Select flights, hotels, and activities to calculate your total trip budget
- **Beautiful Dark UI**: Modern, clean interface inspired by ChatGPT

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Frontend**: React 19, Tailwind CSS v4
- **APIs**:
  - OpenAI GPT-4o-mini (trip parsing & itinerary generation)
  - SerpAPI (flights, hotels, activities, city images)
  - Overshoot AI (video analysis - optional)
- **Validation**: Zod
- **UI Components**: Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- API keys (see Environment Variables)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sidequest.git
cd sidequest/travel-ai
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the `travel-ai` directory:
```env
OPENAI_API_KEY=your_openai_api_key
OVERSHOOT_API_KEY=your_overshoot_api_key  # Optional, for video analysis
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Basic Trip Planning

Simply type a trip request in the search bar:
```
Plan a 5-day trip from NYC to Tokyo in March
```

The AI will generate a complete itinerary with:
- Day-by-day activities
- Flight options
- Hotel recommendations
- Activity pricing with booking links

### Adding Travel Videos

1. Click the **Add videos** button
2. Paste Instagram Reel or TikTok URLs of places you want to visit
3. The AI will analyze the videos and extract locations
4. All detected places will be incorporated into your itinerary

### Setting Preferences

Click the **Preferences** button to add specific requests:
- "No hostels, only 4-star hotels or above"
- "Focus on food and cultural experiences"
- "Budget-friendly options"
- "Include museums and art galleries"

### Calculating Trip Cost

1. Browse the generated itinerary in the sidebar
2. Click on flights, hotels, and activities to select them
3. View the running total at the bottom of the sidebar
4. Click "Clear all" to reset your selections

## API Routes

| Route | Description |
|-------|-------------|
| `/api/parse-trip` | Extracts trip parameters from natural language |
| `/api/plan` | Generates detailed itinerary |
| `/api/flights` | Searches for flight options |
| `/api/hotels` | Searches for hotel options with filtering |
| `/api/activities` | Finds activity prices and booking links |
| `/api/analyze-video` | Extracts locations from social media videos |
| `/api/city-image` | Fetches destination city images |

## Project Structure

```
travel-ai/
├── src/
│   └── app/
│       ├── api/           # API routes
│       ├── globals.css    # Global styles & Tailwind config
│       ├── layout.tsx     # Root layout
│       └── page.tsx       # Main application
├── components/
│   └── ui/               # Reusable UI components
├── lib/
│   └── utils.ts          # Utility functions
├── public/               # Static assets
└── package.json
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o-mini |
| `OVERSHOOT_API_KEY` | No | Overshoot AI key for video analysis (falls back to OpenAI) |

**Note**: The SerpAPI key is currently hardcoded for demo purposes. For production, move it to environment variables.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and not licensed for public use.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [OpenAI](https://openai.com/)
- [SerpAPI](https://serpapi.com/)
- [Radix UI](https://www.radix-ui.com/)
