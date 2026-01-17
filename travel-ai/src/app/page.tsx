"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FlightParams {
  departure_airport_code: string | null;
  arrival_airport_code: string | null;
  departure_date: string | null;
  arrival_date: string | null;
  number_of_adults: number | null;
  number_of_children: number | null;
  number_of_infants: number | null;
  cabin_class: string | null;
  currency: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ProcessedFlight {
  id: string;
  price: number;
  currency: string;
  outbound: {
    departure: string;
    arrival: string;
    duration: number;
    stops: number;
    from?: string;
    to?: string;
  };
  return: {
    departure: string;
    arrival: string;
    duration: number;
    stops: number;
    from?: string;
    to?: string;
  };
  bookingUrl?: string;
}

interface DetectedLocation {
  name: string;
  description: string;
  confidence: number;
  type: "landmark" | "business" | "area" | "region";
  coordinates?: {
    lat?: number;
    lng?: number;
  };
}

interface VideoAnalysisResult {
  videoUrl: string;
  platform: string;
  locations: DetectedLocation[];
  detectedText: string[];
  sceneDescription: string;
  suggestedDestination?: string;
}

interface ItineraryPlan {
  destination: string;
  dates: string;
  budget: string;
  traveler_profile: string;
  flights: { origin: string; cabin: string; notes: string };
  hotel: { area: string; nights: number; style: string; notes: string };
  itinerary: Array<{
    day: number;
    title: string;
    morning: string[];
    afternoon: string[];
    evening: string[];
  }>;
  booking_ctas: { flight: string; hotel: string; activities: string };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI travel agent. Tell me about the round-trip flight you're looking for. For example: \"I need a flight from NYC to Tokyo, leaving March 15th and returning March 22nd for 2 adults.\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [flightParams, setFlightParams] = useState<FlightParams | null>(null);
  const [flights, setFlights] = useState<ProcessedFlight[]>([]);
  const [searchComplete, setSearchComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Video analysis state
  const [videoUrl, setVideoUrl] = useState("");
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisResult | null>(null);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [itineraryPlan, setItineraryPlan] = useState<ItineraryPlan | null>(null);

  async function parsePrompt(userMessage: string, previousData?: FlightParams) {
    const res = await fetch("/api/parse-flight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt: userMessage,
        previousData: previousData || undefined,
      }),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data?.error || "Failed to parse your request");
    }
    
    return res.json();
  }

  async function searchFlights(params: FlightParams) {
    const res = await fetch("/api/flights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data?.error || "Failed to search flights");
    }
    
    return res.json();
  }

  async function doSubmit() {
    const userMessage = input.trim();
    if (!userMessage || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      // Parse the user's message
      const parseResult = await parsePrompt(userMessage, flightParams || undefined);
      setFlightParams(parseResult.data);

      if (!parseResult.complete) {
        // Still missing required fields - ask follow-up
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: parseResult.followUpQuestion || "I need more information to search for flights.",
          },
        ]);
      } else {
        // All fields complete - search for flights
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Great! Searching for round-trip flights from ${parseResult.data.departure_airport_code} to ${parseResult.data.arrival_airport_code}...`,
          },
        ]);

        const flightResults = await searchFlights(parseResult.data);
        setFlights(flightResults.flights || []);
        setSearchComplete(true);

        const resultMessage = flightResults.flights?.length > 0
          ? `Found ${flightResults.flights.length} flight options! Here are the best deals:`
          : "Sorry, I couldn't find any flights matching your criteria. Try adjusting your dates or airports.";

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: resultMessage },
        ]);
      }
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, there was an error: ${err.message}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit();
  }

  function resetSearch() {
    setMessages([
      {
        role: "assistant",
        content: "Hi! I'm your AI travel agent. Tell me about the round-trip flight you're looking for.",
      },
    ]);
    setFlightParams(null);
    setFlights([]);
    setSearchComplete(false);
    setError(null);
  }

  function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function formatDateTime(dateStr: string): { date: string; time: string } {
    if (!dateStr) return { date: "", time: "" };
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  }

  async function analyzeVideo() {
    if (!videoUrl.trim() || analyzingVideo) return;

    setAnalyzingVideo(true);
    setError(null);
    setVideoAnalysis(null);
    setItineraryPlan(null);

    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to analyze video");
      }

      const result: VideoAnalysisResult = await res.json();
      setVideoAnalysis(result);

      // Automatically generate itinerary from detected locations
      if (result.locations.length > 0 || result.suggestedDestination) {
        await generateItineraryFromLocations(result);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzingVideo(false);
    }
  }

  async function generateItineraryFromLocations(analysis: VideoAnalysisResult) {
    try {
      // Build a prompt from detected locations
      const locationNames = analysis.locations.map((l) => l.name).join(", ");
      const destination = analysis.suggestedDestination || locationNames.split(",")[0] || "the destination";
      
      const itineraryPrompt = `Create a travel itinerary for ${destination}. 
Based on the following locations detected in a video:
${locationNames}

Scene description: ${analysis.sceneDescription}

Detected places to visit: ${locationNames}
${analysis.detectedText.length > 0 ? `\nOther context: ${analysis.detectedText.join(", ")}` : ""}

Plan a 3-5 day trip including these locations and other must-see spots in the area.`;

      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: itineraryPrompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to generate itinerary");
      }

      const plan: ItineraryPlan = await res.json();
      setItineraryPlan(plan);
    } catch (err: any) {
      console.error("Itinerary generation error:", err);
      // Don't throw - analysis succeeded even if itinerary generation fails
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">✈️ AI Travel Agent</h1>
        {(flightParams || searchComplete || videoAnalysis) && (
          <Button variant="outline" size="sm" onClick={() => {
            resetSearch();
            setVideoUrl("");
            setVideoAnalysis(null);
            setItineraryPlan(null);
          }}>
            New Search
          </Button>
        )}
      </div>

      <Tabs defaultValue="flights" className="w-full">
        <TabsList>
          <TabsTrigger value="flights">✈️ Flight Search</TabsTrigger>
          <TabsTrigger value="video">🎥 Video Itinerary</TabsTrigger>
        </TabsList>

        <TabsContent value="flights" className="space-y-6">

      {/* Chat Messages */}
      <Card>
        <CardContent className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2 animate-pulse">
                Thinking...
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted Parameters */}
      {flightParams && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Extracted Flight Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant={flightParams.departure_airport_code ? "default" : "outline"}>
                From: {flightParams.departure_airport_code || "?"}
              </Badge>
              <Badge variant={flightParams.arrival_airport_code ? "default" : "outline"}>
                To: {flightParams.arrival_airport_code || "?"}
              </Badge>
              <Badge variant={flightParams.departure_date ? "default" : "outline"}>
                Depart: {flightParams.departure_date || "?"}
              </Badge>
              <Badge variant={flightParams.arrival_date ? "default" : "outline"}>
                Return: {flightParams.arrival_date || "?"}
              </Badge>
              <Badge variant="secondary">
                {flightParams.number_of_adults || 1} Adult(s)
              </Badge>
              {(flightParams.number_of_children || 0) > 0 && (
                <Badge variant="secondary">
                  {flightParams.number_of_children} Child(ren)
                </Badge>
              )}
              <Badge variant="secondary">
                {flightParams.cabin_class || "Economy"}
              </Badge>
              <Badge variant="secondary">
                {flightParams.currency || "USD"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flight Results */}
      {flights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Flight Options</h2>
          {flights.map((flight, idx) => (
            <Card key={flight.id || idx} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 space-y-3">
                    {/* Outbound */}
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-muted-foreground w-16">OUTBOUND</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatDateTime(flight.outbound.departure).time}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">
                          {formatDateTime(flight.outbound.arrival).time}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {formatDuration(flight.outbound.duration)}
                        </Badge>
                        <Badge variant={flight.outbound.stops === 0 ? "secondary" : "outline"} className="text-xs">
                          {flight.outbound.stops === 0 ? "Direct" : `${flight.outbound.stops} stop(s)`}
                        </Badge>
                      </div>
                    </div>
                    {/* Return */}
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-muted-foreground w-16">RETURN</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatDateTime(flight.return.departure).time}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">
                          {formatDateTime(flight.return.arrival).time}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {formatDuration(flight.return.duration)}
                        </Badge>
                        <Badge variant={flight.return.stops === 0 ? "secondary" : "outline"} className="text-xs">
                          {flight.return.stops === 0 ? "Direct" : `${flight.return.stops} stop(s)`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {flight.currency === "USD" ? "$" : flight.currency}{" "}
                      {flight.price.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">per person</div>
                    {flight.bookingUrl && (
                      <Button size="sm" className="mt-2" asChild>
                        <a href={flight.bookingUrl} target="_blank" rel="noopener noreferrer">
                          Book Now
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Input Form */}
      {!searchComplete && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me about your trip..."
            disabled={loading}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                doSubmit();
              }
            }}
          />
          <Button 
            type="button"
            disabled={loading || !input.trim()}
            onClick={() => doSubmit()}
          >
            {loading ? "..." : "Send"}
          </Button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
      )}
        </TabsContent>

        <TabsContent value="video" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>📹 Analyze Instagram Reel or TikTok</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste an Instagram Reel or TikTok URL to automatically detect places and generate a travel itinerary.
              </p>
              <div className="flex gap-2">
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://instagram.com/reel/... or https://tiktok.com/@..."
                  disabled={analyzingVideo}
                  className="flex-1"
                />
                <Button 
                  onClick={analyzeVideo}
                  disabled={!videoUrl.trim() || analyzingVideo}
                >
                  {analyzingVideo ? "Analyzing..." : "Analyze Video"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {videoAnalysis && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>📍 Detected Locations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {videoAnalysis.sceneDescription && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Scene Description:</p>
                      <p className="text-sm text-muted-foreground">{videoAnalysis.sceneDescription}</p>
                    </div>
                  )}
                  {videoAnalysis.suggestedDestination && (
                    <Badge variant="default" className="text-base px-3 py-1">
                      🎯 Suggested Destination: {videoAnalysis.suggestedDestination}
                    </Badge>
                  )}
                  {videoAnalysis.locations.length > 0 ? (
                    <div className="space-y-2">
                      {videoAnalysis.locations.map((location, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium">{location.name}</h4>
                              <p className="text-sm text-muted-foreground mt-1">{location.description}</p>
                              <div className="flex gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {location.type}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {(location.confidence * 100).toFixed(0)}% confidence
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No specific locations detected in the video.</p>
                  )}
                  {videoAnalysis.detectedText.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">Detected Text:</p>
                      <div className="flex flex-wrap gap-2">
                        {videoAnalysis.detectedText.map((text, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {text}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {itineraryPlan && (
                <Card>
                  <CardHeader>
                    <CardTitle>🗺️ Generated Itinerary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Destination</p>
                        <p className="text-lg font-semibold">{itineraryPlan.destination}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Dates</p>
                        <p className="text-lg font-semibold">{itineraryPlan.dates}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Budget</p>
                        <p className="text-lg font-semibold">{itineraryPlan.budget}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Hotel</p>
                        <p className="text-sm">{itineraryPlan.hotel.area} - {itineraryPlan.hotel.style}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold">Day-by-Day Itinerary</h3>
                      {itineraryPlan.itinerary.map((day, idx) => (
                        <div key={idx} className="p-4 border rounded-lg space-y-2">
                          <h4 className="font-medium">Day {day.day}: {day.title}</h4>
                          {day.morning.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">🌅 Morning:</p>
                              <ul className="text-sm list-disc list-inside ml-2">
                                {day.morning.map((activity, i) => (
                                  <li key={i}>{activity}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {day.afternoon.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">☀️ Afternoon:</p>
                              <ul className="text-sm list-disc list-inside ml-2">
                                {day.afternoon.map((activity, i) => (
                                  <li key={i}>{activity}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {day.evening.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">🌙 Evening:</p>
                              <ul className="text-sm list-disc list-inside ml-2">
                                {day.evening.map((activity, i) => (
                                  <li key={i}>{activity}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {(itineraryPlan.booking_ctas.flight || itineraryPlan.booking_ctas.hotel || itineraryPlan.booking_ctas.activities) && (
                      <div className="flex gap-2 pt-4 border-t">
                        {itineraryPlan.booking_ctas.flight && (
                          <Button size="sm" asChild>
                            <a href={itineraryPlan.booking_ctas.flight} target="_blank" rel="noopener noreferrer">
                              Book Flights
                            </a>
                          </Button>
                        )}
                        {itineraryPlan.booking_ctas.hotel && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={itineraryPlan.booking_ctas.hotel} target="_blank" rel="noopener noreferrer">
                              Book Hotel
                            </a>
                          </Button>
                        )}
                        {itineraryPlan.booking_ctas.activities && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={itineraryPlan.booking_ctas.activities} target="_blank" rel="noopener noreferrer">
                              Book Activities
                            </a>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
      )}
    </main>
  );
}
