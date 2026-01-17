"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

interface Activity {
  id: string;
  name: string;
  address: string;
  rating?: number;
  ratingCount?: number;
  types: string[];
  photoUrl?: string;
  category: string;
  time?: string;
  duration?: string;
  notes?: string;
}

interface DayItinerary {
  day: number;
  date: string;
  activities: Activity[];
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
  const [itinerary, setItinerary] = useState<DayItinerary[] | null>(null);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [activityPreferences, setActivityPreferences] = useState("");
  const [destinationName, setDestinationName] = useState<string | null>(null);

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

  async function generateItinerary() {
    if (!flightParams?.arrival_airport_code || !flightParams?.arrival_date || !flightParams?.departure_date) {
      setItineraryError("Missing flight information to generate itinerary");
      return;
    }

    setLoadingItinerary(true);
    setItineraryError(null);

    try {
      // Convert airport code to city name (simplified - in production, use a mapping)
      const destination = flightParams.arrival_airport_code;
      
      // For activities, we need:
      // - arrival_date: when you arrive at destination (use departure_date from flight search)
      // - departure_date: when you leave destination (use arrival_date from flight search)
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          arrival_date: flightParams.departure_date, // When you leave origin = when you arrive at destination
          departure_date: flightParams.arrival_date, // When you return to origin = when you leave destination
          preferences: activityPreferences || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMsg = data?.error || "Failed to generate itinerary";
        // Include debug info if available
        if (data?.debug) {
          console.error("Activities API debug info:", data.debug);
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setItinerary(data.itinerary || []);
      setDestinationName(data.destination || null);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Great! I've generated a ${data.days}-day itinerary for ${data.destination} with ${data.itinerary?.reduce((sum: number, day: DayItinerary) => sum + day.activities.length, 0) || 0} activities.`,
        },
      ]);
    } catch (err: any) {
      setItineraryError(err.message);
    } finally {
      setLoadingItinerary(false);
    }
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
    setItinerary(null);
    setItineraryError(null);
    setActivityPreferences("");
    setDestinationName(null);
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

  function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">✈️ AI Travel Agent</h1>
        {(flightParams || searchComplete) && (
          <Button variant="outline" size="sm" onClick={resetSearch}>
            New Search
          </Button>
        )}
      </div>

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

      {/* Activities/Itinerary Section */}
      {searchComplete && flightParams && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">🗺️ Local Activities & Itinerary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!itinerary ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Generate a personalized itinerary with local activities, attractions, and recommendations for your destination.
                </p>
                <div className="space-y-2">
                  <Input
                    value={activityPreferences}
                    onChange={(e) => setActivityPreferences(e.target.value)}
                    placeholder="Preferences (e.g., 'museums and art galleries', 'outdoor activities', 'family-friendly')"
                    className="w-full"
                  />
                  <Button 
                    onClick={generateItinerary} 
                    disabled={loadingItinerary}
                    className="w-full"
                  >
                    {loadingItinerary ? "Generating Itinerary..." : "Generate Itinerary"}
                  </Button>
                </div>
                {itineraryError && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{itineraryError}</p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-semibold">
                    {itinerary.length}-Day Itinerary for {destinationName || flightParams.arrival_airport_code}
                  </h3>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setItinerary(null);
                      setActivityPreferences("");
                    }}
                  >
                    Regenerate
                  </Button>
                </div>
                {itinerary.map((day) => (
                  <Card key={day.day} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        Day {day.day} - {formatDate(day.date)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {day.activities.map((activity, idx) => (
                        <div key={activity.id || idx} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                          {activity.photoUrl ? (
                            <img 
                              src={activity.photoUrl} 
                              alt={activity.name}
                              className="w-20 h-20 object-cover rounded"
                              onError={(e) => {
                                // Log error and hide image if it fails to load
                                console.error(`Failed to load image for ${activity.name}:`, activity.photoUrl);
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                              onLoad={() => {
                                console.log(`Successfully loaded image for ${activity.name}`);
                              }}
                            />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                              No Image
                            </div>
                          )}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{activity.name}</h4>
                                <p className="text-xs text-muted-foreground">{activity.address}</p>
                              </div>
                              <div className="text-right">
                                {activity.time && (
                                  <Badge variant="outline" className="text-xs">
                                    {activity.time}
                                  </Badge>
                                )}
                                {activity.duration && (
                                  <Badge variant="secondary" className="text-xs ml-1">
                                    {activity.duration}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {activity.category}
                              </Badge>
                              {activity.rating && (
                                <span className="text-xs text-muted-foreground">
                                  ⭐ {activity.rating.toFixed(1)}
                                  {activity.ratingCount && ` (${activity.ratingCount.toLocaleString()})`}
                                </span>
                              )}
                            </div>
                            {activity.notes && (
                              <p className="text-xs text-muted-foreground italic">{activity.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
    </main>
  );
}
