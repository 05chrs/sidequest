"use client";

import { useState, useRef, useEffect } from "react";

interface FlightParams {
  departure_airport_code: string | null;
  arrival_airport_code: string | null;
  departure_date: string | null;
  arrival_date: string | null;
  destination_city: string | null;
  number_of_adults: number | null;
  trip_duration_days: number | null;
}

interface DetectedLocation {
  name: string;
  description: string;
  confidence: number;
  type: "landmark" | "business" | "area" | "region";
}

interface VideoAnalysisResult {
  videoUrl: string;
  platform: string;
  locations: DetectedLocation[];
  detectedText: string[];
  sceneDescription: string;
  suggestedDestination?: string;
  caption?: string | null;
  author?: string | null;
  hashtags?: string[];
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

interface VideoEntry {
  id: string;
  url: string;
  status: "pending" | "analyzing" | "done" | "error";
  analysis?: VideoAnalysisResult;
  error?: string;
}

interface HotelResult {
  name: string;
  type: string;
  description?: string;
  link?: string;
  thumbnail?: string;
  rating: number;
  reviews: number;
  hotel_class?: number;
  price: number;
  price_formatted: string;
  total_price?: number;
  total_price_formatted?: string;
  amenities: string[];
}

interface FlightResult {
  id: string;
  price: number;
  currency: string;
  outbound: {
    departure: string;
    arrival: string;
    duration: number;
    stops: number;
    segments: Array<{
      from: string;
      to: string;
      departure: string;
      arrival: string;
      carrier: string;
      flightNumber: string;
    }>;
  };
  return: {
    departure: string;
    arrival: string;
    duration: number;
    stops: number;
    segments: Array<{
      from: string;
      to: string;
      departure: string;
      arrival: string;
      carrier: string;
      flightNumber: string;
    }>;
  };
  bookingUrl?: string;
}

interface ActivityPrice {
  name: string;
  searchQuery: string;
  price: number | null;
  price_formatted: string;
  source: string;
  link?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  duration?: string;
  description?: string;
}

interface TripSelection {
  flight: FlightResult | null;
  hotel: HotelResult | null;
  activities: Map<string, ActivityPrice>; // key: "day-timeOfDay-index"
}

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [flightParams, setFlightParams] = useState<FlightParams | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [videoEntries, setVideoEntries] = useState<VideoEntry[]>([]);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [activityPreferences, setActivityPreferences] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  
  const [itineraryPlan, setItineraryPlan] = useState<ItineraryPlan | null>(null);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [hotelsError, setHotelsError] = useState<string | null>(null);
  
  const [flights, setFlights] = useState<FlightResult[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [flightsError, setFlightsError] = useState<string | null>(null);
  
  const [activityPrices, setActivityPrices] = useState<Map<string, ActivityPrice>>(new Map());
  const [loadingActivities, setLoadingActivities] = useState(false);
  
  // Selection state for trip cost calculation
  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<HotelResult | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set()); // Set of activity keys
  
  // City image for sidebar header
  const [cityImage, setCityImage] = useState<string | null>(null);
  const [loadingCityImage, setLoadingCityImage] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (itineraryPlan) setSidebarOpen(true);
  }, [itineraryPlan]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function parseAndGenerateItinerary() {
    const userMessage = input.trim();
    if (!userMessage || loading) return;

    setLoading(true);
    setGeneratingItinerary(true);
    setError(null);

    try {
      const parseRes = await fetch("/api/parse-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage }),
      });
      
      if (!parseRes.ok) {
        const data = await parseRes.json();
        throw new Error(data?.error || "Failed to parse your request");
      }
      
      const parseResult = await parseRes.json();
      setFlightParams(parseResult.data);

      const completedVideos = videoEntries.filter((v) => v.status === "done" && v.analysis);
      const allLocations: string[] = [];
      const allCaptions: string[] = [];
      let suggestedDestination = "";

      for (const video of completedVideos) {
        if (video.analysis) {
          video.analysis.locations.forEach((loc) => {
            if (!allLocations.includes(loc.name)) allLocations.push(loc.name);
          });
          if (video.analysis.caption) allCaptions.push(video.analysis.caption);
          if (!suggestedDestination && video.analysis.suggestedDestination) {
            suggestedDestination = video.analysis.suggestedDestination;
          }
        }
      }

      let itineraryPrompt = `Create a travel itinerary based on this request: "${userMessage}"`;
      const destination = parseResult.data?.destination_city || parseResult.data?.arrival_airport_code || suggestedDestination;
      if (destination) itineraryPrompt += `\n\nDestination: ${destination}`;
      if (parseResult.data?.departure_date && parseResult.data?.arrival_date) {
        itineraryPrompt += `\nDates: ${parseResult.data.departure_date} to ${parseResult.data.arrival_date}`;
      }
      if (allLocations.length > 0) {
        itineraryPrompt += `\n\n🎯 IMPORTANT - The user has added ${completedVideos.length} travel video(s) with ${allLocations.length} places that MUST be included in the itinerary:`;
        itineraryPrompt += `\n${allLocations.map((loc, i) => `${i + 1}. ${loc}`).join("\n")}`;
        itineraryPrompt += `\n\nYou MUST include ALL of these places in the day-by-day itinerary. These are places the user specifically wants to visit based on videos they've seen.`;
      }
      if (allCaptions.length > 0) {
        itineraryPrompt += `\n\nContext from video captions:\n${allCaptions.map((c, i) => `Video ${i + 1}: "${c}"`).join("\n")}`;
      }
      if (activityPreferences.trim()) {
        itineraryPrompt += `\n\nAdditional user preferences: ${activityPreferences.trim()}`;
      }
      itineraryPrompt += "\n\nCreate a detailed day-by-day itinerary that includes EVERY place from the videos, organized logically by location/neighborhood.";

      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: itineraryPrompt }),
      });

      if (!planRes.ok) {
        const data = await planRes.json();
        throw new Error(data?.error || "Failed to generate itinerary");
      }

      const plan: ItineraryPlan = await planRes.json();
      setItineraryPlan(plan);
      setSidebarOpen(true);
      
      // Combine user prompt and activity preferences for filtering
      const userPreferences = `${userMessage} ${activityPreferences}`.trim();
      
      // Fetch hotels in parallel if we have destination and dates
      const hotelDestination = destination || plan.destination;
      if (hotelDestination && parseResult.data?.departure_date && parseResult.data?.arrival_date) {
        fetchHotels(hotelDestination, parseResult.data.departure_date, parseResult.data.arrival_date, parseResult.data.number_of_adults || 2, userPreferences);
      }
      
      // Fetch flights if we have airport codes
      if (parseResult.data?.departure_airport_code && parseResult.data?.arrival_airport_code) {
        fetchFlights(parseResult.data, userPreferences);
      }
      
      // Fetch activity prices for the itinerary
      fetchActivityPrices(plan);
      
      // Fetch city image for sidebar
      fetchCityImage(plan.destination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setGeneratingItinerary(false);
    }
  }
  
  async function fetchFlights(params: FlightParams, preferences?: string) {
    if (!params.departure_airport_code || !params.arrival_airport_code || !params.departure_date || !params.arrival_date) {
      return;
    }
    
    setLoadingFlights(true);
    setFlightsError(null);
    try {
      // Determine cabin class from preferences
      let cabinClass = "Economy";
      if (preferences) {
        const lower = preferences.toLowerCase();
        if (/business\s*class/i.test(lower)) cabinClass = "Business";
        else if (/first\s*class/i.test(lower)) cabinClass = "First";
        else if (/premium\s*(economy)?/i.test(lower)) cabinClass = "Premium_Economy";
      }
      
      const res = await fetch("/api/flights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departure_airport_code: params.departure_airport_code,
          arrival_airport_code: params.arrival_airport_code,
          departure_date: params.departure_date,
          arrival_date: params.arrival_date,
          number_of_adults: params.number_of_adults || 1,
          number_of_children: 0,
          number_of_infants: 0,
          cabin_class: cabinClass,
          currency: "USD",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to fetch flights");
      }
      const data = await res.json();
      setFlights(data.flights || []);
    } catch (err: any) {
      console.error("Flights error:", err);
      setFlightsError(err.message);
    } finally {
      setLoadingFlights(false);
    }
  }

  async function fetchHotels(destination: string, checkIn: string, checkOut: string, adults: number, preferences?: string) {
    setLoadingHotels(true);
    setHotelsError(null);
    try {
      const res = await fetch("/api/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: `${destination} hotels`,
          check_in_date: checkIn,
          check_out_date: checkOut,
          adults,
          children: 0,
          currency: "USD",
          preferences, // Pass user preferences for filtering (e.g., "no hostels", "luxury only")
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to fetch hotels");
      }
      const data = await res.json();
      setHotels(data.hotels || []);
    } catch (err: any) {
      console.error("Hotels error:", err);
      setHotelsError(err.message);
    } finally {
      setLoadingHotels(false);
    }
  }

  async function fetchCityImage(city: string) {
    setLoadingCityImage(true);
    setCityImage(null);
    try {
      const res = await fetch("/api/city-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.imageUrl) {
          setCityImage(data.imageUrl);
        }
      }
    } catch (err) {
      console.error("City image error:", err);
    } finally {
      setLoadingCityImage(false);
    }
  }

  async function fetchActivityPrices(plan: ItineraryPlan) {
    setLoadingActivities(true);
    
    // Collect all unique activities from the itinerary
    const allActivities: { key: string; name: string }[] = [];
    
    for (const day of plan.itinerary) {
      ["morning", "afternoon", "evening"].forEach((timeOfDay) => {
        const activities = day[timeOfDay as keyof typeof day] as string[];
        if (Array.isArray(activities)) {
          activities.forEach((activity, idx) => {
            const key = `${day.day}-${timeOfDay}-${idx}`;
            // Skip very generic activities
            if (activity.length > 5 && !allActivities.find(a => a.name === activity)) {
              allActivities.push({ key, name: activity });
            }
          });
        }
      });
    }

    try {
      // Fetch prices in batches of 10 to avoid overwhelming the API
      const batchSize = 10;
      const newPrices = new Map<string, ActivityPrice>();
      
      for (let i = 0; i < allActivities.length; i += batchSize) {
        const batch = allActivities.slice(i, i + batchSize);
        const res = await fetch("/api/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: plan.destination,
            activities: batch.map(a => a.name),
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.activities) {
            data.activities.forEach((actPrice: ActivityPrice, idx: number) => {
              const actItem = batch[idx];
              if (actItem) {
                newPrices.set(actItem.key, actPrice);
              }
            });
          }
        }
      }
      
      setActivityPrices(newPrices);
    } catch (err) {
      console.error("Activity prices error:", err);
    } finally {
      setLoadingActivities(false);
    }
  }

  // Calculate total trip cost based on selections
  function calculateTotalCost(): { flights: number; hotel: number; activities: number; total: number; nights: number } {
    let flightsCost = selectedFlight?.price || 0;
    let hotelCost = 0;
    let activitiesCost = 0;
    const nights = itineraryPlan?.hotel?.nights || (itineraryPlan?.itinerary?.length ? itineraryPlan.itinerary.length - 1 : 0) || 1;
    
    if (selectedHotel) {
      hotelCost = selectedHotel.price * nights;
    }
    
    selectedActivities.forEach((key) => {
      const activity = activityPrices.get(key);
      if (activity?.price) {
        activitiesCost += activity.price;
      }
    });
    
    return {
      flights: flightsCost,
      hotel: hotelCost,
      activities: activitiesCost,
      total: flightsCost + hotelCost + activitiesCost,
      nights,
    };
  }

  function toggleActivitySelection(key: string) {
    setSelectedActivities((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    parseAndGenerateItinerary();
  }

  function resetSearch() {
    setInput("");
    setFlightParams(null);
    setError(null);
    setVideoEntries([]);
    setNewVideoUrl("");
    setActivityPreferences("");
    setItineraryPlan(null);
    setShowVideoInput(false);
    setShowPreferences(false);
    setSidebarOpen(false);
    setHotels([]);
    setHotelsError(null);
    setFlights([]);
    setFlightsError(null);
    setActivityPrices(new Map());
    setSelectedFlight(null);
    setSelectedHotel(null);
    setSelectedActivities(new Set());
    setCityImage(null);
  }

  function addVideoUrl() {
    const url = newVideoUrl.trim();
    if (!url) return;
    const newEntry: VideoEntry = { id: Date.now().toString(), url, status: "pending" };
    setVideoEntries((prev) => [...prev, newEntry]);
    setNewVideoUrl("");
    analyzeVideo(newEntry.id, url);
  }

  function removeVideo(id: string) {
    setVideoEntries((prev) => prev.filter((v) => v.id !== id));
  }

  async function analyzeVideo(id: string, url: string) {
    setVideoEntries((prev) => prev.map((v) => (v.id === id ? { ...v, status: "analyzing" as const } : v)));
    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to analyze video");
      }
      const analysis: VideoAnalysisResult = await res.json();
      setVideoEntries((prev) => prev.map((v) => (v.id === id ? { ...v, status: "done" as const, analysis } : v)));
    } catch (err: any) {
      setVideoEntries((prev) => prev.map((v) => (v.id === id ? { ...v, status: "error" as const, error: err.message } : v)));
    }
  }

  const analyzingCount = videoEntries.filter((v) => v.status === "analyzing").length;
  const completedVideos = videoEntries.filter((v) => v.status === "done" && v.analysis);
  
  // Collect all unique places from all videos
  const allPlacesFromVideos: { name: string; videoIndex: number }[] = [];
  completedVideos.forEach((video, videoIdx) => {
    video.analysis?.locations.forEach((loc) => {
      if (!allPlacesFromVideos.find(p => p.name === loc.name)) {
        allPlacesFromVideos.push({ name: loc.name, videoIndex: videoIdx + 1 });
      }
    });
  });

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-[#111111] z-30 transition-all duration-300 ease-out overflow-hidden ${sidebarOpen ? 'w-[380px]' : 'w-0'}`}
        style={{ boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none' }}
      >
        <div className="w-[380px] h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Your Itinerary</span>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {generatingItinerary ? (
              <div className="space-y-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-3">
                    <div className="h-5 w-3/4 rounded-lg shimmer-bg" />
                    <div className="space-y-2 ml-4">
                      <div className="h-3 w-1/4 rounded shimmer-bg" />
                      <div className="h-3 w-full rounded shimmer-bg" />
                      <div className="h-3 w-5/6 rounded shimmer-bg" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-4">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-2 h-2 bg-gradient-to-r from-blue-600 to-violet-400 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                    ))}
                  </div>
                  <span className="text-sm text-gray-400">Creating your itinerary...</span>
                </div>
              </div>
            ) : itineraryPlan ? (
              <div className="space-y-6">
                {/* City Image & Summary Card */}
                <div className="rounded-2xl overflow-hidden border border-gray-800">
                  {/* City Image */}
                  <div className="relative h-40 bg-gradient-to-br from-gray-800 to-gray-900">
                    {loadingCityImage ? (
                      <div className="absolute inset-0 shimmer-bg-dark" />
                    ) : cityImage ? (
                      <img 
                        src={cityImage} 
                        alt={itineraryPlan.destination}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          // Hide image on error, show gradient fallback
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-violet-500" />
                    )}
                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                    {/* Destination name overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-xl font-bold text-white drop-shadow-lg">{itineraryPlan.destination}</h3>
                      <p className="text-sm text-white/90 mt-0.5">{itineraryPlan.dates}</p>
                    </div>
                  </div>
                  {/* Budget badge */}
                  {itineraryPlan.budget && (
                    <div className="px-4 py-3 bg-[#1a1a1a]">
                      <span className="inline-block px-3 py-1 text-xs font-semibold text-gray-300 bg-gray-800 rounded-full border border-gray-700">
                        {itineraryPlan.budget}
                      </span>
                    </div>
                  )}
                </div>

                {/* Days */}
                <div className="space-y-6">
                  {itineraryPlan.itinerary.map((day) => {
                    const renderActivityItem = (item: string, timeOfDay: string, idx: number) => {
                      const key = `${day.day}-${timeOfDay}-${idx}`;
                      const priceInfo = activityPrices.get(key);
                      const isSelected = selectedActivities.has(key);
                      
                      return (
                        <li 
                          key={idx} 
                          className={`text-sm text-gray-300 flex items-start gap-2 p-2 -mx-2 rounded-lg cursor-pointer transition-all ${
                            isSelected ? "bg-violet-900/30" : "hover:bg-gray-800/50"
                          }`}
                          onClick={() => toggleActivitySelection(key)}
                        >
                          <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected 
                              ? "border-violet-400 bg-gradient-to-r from-blue-600 to-violet-400" 
                              : "border-gray-600"
                          }`}>
                            {isSelected && (
                              <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M1.5 5l2 2 4-4.5" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={isSelected ? "text-violet-300" : ""}>{item}</span>
                            {priceInfo && (
                              <span className={`ml-2 text-xs font-medium ${
                                priceInfo.price === 0 ? "text-gray-500" :
                                priceInfo.price === null ? "text-gray-500" :
                                isSelected ? "text-violet-300" : "text-violet-400"
                              }`}>
                                {priceInfo.price_formatted}
                              </span>
                            )}
                            {loadingActivities && !priceInfo && (
                              <span className="ml-2 inline-block w-10 h-3 rounded shimmer-bg-dark" />
                            )}
                          </div>
                        </li>
                      );
                    };

                    return (
                      <div key={day.day} className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 flex items-center justify-center bg-gradient-to-r from-blue-600 to-violet-400 text-white text-xs font-bold rounded-full">
                            {day.day}
                          </span>
                          <h4 className="text-sm font-bold text-white">{day.title}</h4>
                        </div>
                        <div className="ml-11 space-y-4">
                          {day.morning.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Morning</p>
                              <ul className="space-y-1">
                                {day.morning.map((item, i) => renderActivityItem(item, "morning", i))}
                              </ul>
                            </div>
                          )}
                          {day.afternoon.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Afternoon</p>
                              <ul className="space-y-1">
                                {day.afternoon.map((item, i) => renderActivityItem(item, "afternoon", i))}
                              </ul>
                            </div>
                          )}
                          {day.evening.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Evening</p>
                              <ul className="space-y-1">
                                {day.evening.map((item, i) => renderActivityItem(item, "evening", i))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Flights Section */}
                <div className="pt-6 border-t border-gray-800">
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="18" height="18" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                    </svg>
                    <h3 className="text-sm font-bold text-white">Flight Options</h3>
                  </div>
                  
                  {loadingFlights ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-3 rounded-xl border border-gray-800">
                          <div className="space-y-2">
                            <div className="h-4 w-3/4 rounded shimmer-bg-dark" />
                            <div className="h-3 w-1/2 rounded shimmer-bg-dark" />
                            <div className="h-4 w-1/4 rounded shimmer-bg-dark" />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="w-1.5 h-1.5 bg-gradient-to-r from-blue-600 to-violet-400 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">Searching flights...</span>
                      </div>
                    </div>
                  ) : flightsError ? (
                    <div className="p-3 rounded-xl bg-red-900/30 border border-red-800">
                      <p className="text-xs text-red-400">{flightsError}</p>
                    </div>
                  ) : flights.length > 0 ? (
                    <div className="space-y-3">
                      {flights.slice(0, 5).map((flight, idx) => {
                        const isSelected = selectedFlight?.id === flight.id;
                        return (
                          <div
                            key={flight.id || idx}
                            onClick={() => setSelectedFlight(isSelected ? null : flight)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? "border-violet-400 bg-violet-900/30 ring-1 ring-violet-400"
                                : "border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? "border-violet-400 bg-gradient-to-r from-blue-600 to-violet-400" : "border-gray-600"
                                }`}>
                                  {isSelected && (
                                    <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5">
                                      <path d="M2 6l3 3 5-6" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-lg font-bold text-violet-400">${flight.price}</span>
                              </div>
                              <span className="text-[10px] text-gray-500">roundtrip</span>
                            </div>
                            
                            {/* Outbound */}
                            <div className="space-y-1 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-gray-500 w-10">OUT</span>
                                <span className="text-xs font-semibold text-white">
                                  {flight.outbound.segments?.[0]?.from || "—"} → {flight.outbound.segments?.[flight.outbound.segments.length - 1]?.to || "—"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 pl-12">
                                <span className="text-[10px] text-gray-400">
                                  {flight.outbound.departure ? new Date(flight.outbound.departure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {Math.floor((flight.outbound.duration || 0) / 60)}h {(flight.outbound.duration || 0) % 60}m
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {flight.outbound.stops === 0 ? "Nonstop" : `${flight.outbound.stops} stop${flight.outbound.stops > 1 ? 's' : ''}`}
                                </span>
                              </div>
                            </div>
                            
                            {/* Return */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-medium text-gray-500 w-10">RET</span>
                                <span className="text-xs font-semibold text-white">
                                  {flight.return.segments?.[0]?.from || "—"} → {flight.return.segments?.[flight.return.segments.length - 1]?.to || "—"}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 pl-12">
                                <span className="text-[10px] text-gray-400">
                                  {flight.return.departure ? new Date(flight.return.departure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {Math.floor((flight.return.duration || 0) / 60)}h {(flight.return.duration || 0) % 60}m
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {flight.return.stops === 0 ? "Nonstop" : `${flight.return.stops} stop${flight.return.stops > 1 ? 's' : ''}`}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
                              {flight.outbound.segments?.[0]?.carrier && (
                                <span className="text-[10px] text-gray-500">
                                  {flight.outbound.segments[0].carrier}
                                </span>
                              )}
                              {flight.bookingUrl && (
                                <a
                                  href={flight.bookingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] font-medium text-violet-400 hover:text-violet-300"
                                >
                                  Book →
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {flights.length > 5 && (
                        <p className="text-xs text-center text-gray-500 pt-2">
                          +{flights.length - 5} more flights available
                        </p>
                      )}
                    </div>
                  ) : flightParams?.departure_airport_code ? (
                    <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-800 text-center">
                      <p className="text-xs text-gray-400">No flights found for these dates</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-800 text-center">
                      <p className="text-xs text-gray-400">Add your departure city to see flight prices</p>
                    </div>
                  )}
                </div>

                {/* Hotels Section */}
                <div className="pt-6 border-t border-gray-800">
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="18" height="18" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M21 7H3l2-4h14l2 4Z"/><path d="M8 11h8v6H8z"/>
                    </svg>
                    <h3 className="text-sm font-bold text-white">Recommended Hotels</h3>
                  </div>
                  
                  {loadingHotels ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-3 rounded-xl border border-gray-800">
                          <div className="flex gap-3">
                            <div className="w-16 h-16 rounded-lg shimmer-bg-dark" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-3/4 rounded shimmer-bg-dark" />
                              <div className="h-3 w-1/2 rounded shimmer-bg-dark" />
                              <div className="h-4 w-1/4 rounded shimmer-bg-dark" />
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="w-1.5 h-1.5 bg-gradient-to-r from-blue-600 to-violet-400 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">Finding best hotels...</span>
                      </div>
                    </div>
                  ) : hotelsError ? (
                    <div className="p-3 rounded-xl bg-red-900/30 border border-red-800">
                      <p className="text-xs text-red-400">{hotelsError}</p>
                    </div>
                  ) : hotels.length > 0 ? (
                    <div className="space-y-3">
                      {hotels.slice(0, 5).map((hotel, idx) => {
                        const isSelected = selectedHotel?.name === hotel.name;
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedHotel(isSelected ? null : hotel)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? "border-violet-400 bg-violet-900/30 ring-1 ring-violet-400"
                                : "border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
                            }`}
                          >
                            <div className="flex gap-3">
                              <div className="relative">
                                {hotel.thumbnail ? (
                                  <img
                                    src={hotel.thumbnail}
                                    alt={hotel.name}
                                    className="w-16 h-16 rounded-lg object-cover bg-gray-800"
                                  />
                                ) : (
                                  <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center">
                                    <svg width="20" height="20" fill="none" stroke="#666" strokeWidth="1.5">
                                      <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M21 7H3l2-4h14l2 4Z"/>
                                    </svg>
                                  </div>
                                )}
                                <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? "border-violet-400 bg-gradient-to-r from-blue-600 to-violet-400" : "border-gray-600 bg-gray-900"
                                }`}>
                                  {isSelected && (
                                    <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5">
                                      <path d="M2 6l3 3 5-6" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white truncate">{hotel.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {hotel.rating > 0 && (
                                    <div className="flex items-center gap-1">
                                      <svg width="12" height="12" fill="#facc15" stroke="#facc15" strokeWidth="1">
                                        <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/>
                                      </svg>
                                      <span className="text-xs font-medium text-gray-300">{hotel.rating.toFixed(1)}</span>
                                    </div>
                                  )}
                                  {hotel.hotel_class && (
                                    <span className="text-[10px] text-gray-500">{hotel.hotel_class}-star</span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                  <span className="text-sm font-bold text-violet-400">{hotel.price_formatted}</span>
                                  <span className="text-[10px] text-gray-500">/night</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              {hotel.amenities.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {hotel.amenities.slice(0, 3).map((amenity, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-[9px] font-medium bg-gray-800 text-gray-400 rounded">
                                      {amenity}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {hotel.link && (
                                <a
                                  href={hotel.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] font-medium text-violet-400 hover:text-violet-300"
                                >
                                  Book →
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {hotels.length > 5 && (
                        <p className="text-xs text-center text-gray-500 pt-2">
                          +{hotels.length - 5} more hotels available
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-800 text-center">
                      <p className="text-xs text-gray-400">No hotels found for these dates</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        
        {/* Price Summary Panel - Sticky at bottom */}
        {itineraryPlan && (selectedFlight || selectedHotel || selectedActivities.size > 0) && (
          <div className="sticky bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-gray-800 p-4 shadow-lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">Trip Estimate</span>
                <button 
                  onClick={() => {
                    setSelectedFlight(null);
                    setSelectedHotel(null);
                    setSelectedActivities(new Set());
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Clear all
                </button>
              </div>
              
              <div className="space-y-2 text-sm">
                {selectedFlight && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                      </svg>
                      Flights
                    </span>
                    <span className="font-medium text-white">${calculateTotalCost().flights.toLocaleString()}</span>
                  </div>
                )}
                {selectedHotel && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M21 7H3l2-4h14l2 4Z"/>
                      </svg>
                      Hotel ({calculateTotalCost().nights} nights)
                    </span>
                    <span className="font-medium text-white">${calculateTotalCost().hotel.toLocaleString()}</span>
                  </div>
                )}
                {selectedActivities.size > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center gap-2">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
                      </svg>
                      Activities ({selectedActivities.size})
                    </span>
                    <span className="font-medium text-white">${calculateTotalCost().activities.toLocaleString()}</span>
                  </div>
                )}
              </div>
              
              <div className="pt-3 border-t border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-white">Total Estimate</span>
                  <span className="text-xl font-bold text-violet-400">
                    ${calculateTotalCost().total.toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {flightParams?.number_of_adults && flightParams.number_of_adults > 1 
                    ? `Per person prices shown • ${flightParams.number_of_adults} travelers`
                    : "Prices may vary • Select items to add to estimate"
                  }
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-[380px]' : 'ml-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-6 bg-[#0a0a0a] border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-r from-blue-600 to-violet-400 rounded-xl flex items-center justify-center p-1.5">
              <img src="/logo.png" alt="Sidequest Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-base font-bold text-white">sidequest</span>
          </div>
          {(itineraryPlan || flightParams) && (
            <button onClick={resetSearch} className="px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl border border-transparent hover:border-gray-700 transition-all">
              New trip
            </button>
          )}
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 py-16">
          <div className="w-full max-w-xl space-y-10">
            {/* Hero */}
            <div className="text-center space-y-4">
              <img 
                src="/star2.png" 
                alt="Star" 
                className="w-64 h-64 mx-auto mb-2"
              />
              <h1 className="text-4xl font-bold text-white tracking-tight">tell me about your next sidequest.</h1>
              <p className="text-lg text-gray-400">describe your dream, and i'll make it a reality.</p>
            </div>

            {/* Main Input */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div 
                className="relative bg-[#1a1a1a] rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.3)' }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Plan a trip from NYC to Tokyo, March 15-22..."
                  disabled={loading}
                  className="w-full h-14 pl-5 pr-28 text-base text-white bg-[#1a1a1a] placeholder-gray-500 border-0 focus:ring-0 focus:outline-none"
                  style={{ fontSize: '16px' }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="w-10 h-10 flex items-center justify-center bg-gradient-to-r from-blue-600 to-violet-400 text-white rounded-xl hover:bg-gradient-to-r from-blue-600 to-violet-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Option Buttons */}
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowVideoInput(!showVideoInput)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all ${
                    showVideoInput || videoEntries.length > 0
                      ? 'bg-gradient-to-r from-blue-600 to-violet-400 text-white'
                      : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
                  }`}
                  style={{ boxShadow: showVideoInput || videoEntries.length > 0 ? '0 2px 8px rgba(167,139,250,0.3)' : 'none' }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
                  </svg>
                  {videoEntries.length > 0 ? `${videoEntries.length} video${videoEntries.length > 1 ? 's' : ''}` : 'Add videos'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreferences(!showPreferences)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full transition-all ${
                    showPreferences || activityPreferences
                      ? 'bg-gradient-to-r from-blue-600 to-violet-400 text-white'
                      : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600'
                  }`}
                  style={{ boxShadow: showPreferences || activityPreferences ? '0 2px 8px rgba(167,139,250,0.3)' : 'none' }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>
                  </svg>
                  Preferences
                </button>
              </div>
            </form>

            {/* Video Input Panel */}
            {showVideoInput && (
              <div className="bg-[#141414] rounded-2xl p-6 space-y-4 border border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                      <svg width="16" height="16" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white">Add travel videos</span>
                      <p className="text-xs text-gray-500">Add as many as you want - all places will be included</p>
                    </div>
                  </div>
                  {videoEntries.length > 0 && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-gradient-to-r from-blue-600 to-violet-400 text-white rounded-full">
                      {videoEntries.length}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste Instagram Reel or TikTok URL..."
                    className="flex-1 h-12 px-4 text-sm bg-[#1a1a1a] text-white rounded-xl border border-gray-700 placeholder-gray-500 focus:border-violet-400 focus:outline-none transition-colors"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideoUrl(); }}}
                  />
                  <button
                    type="button"
                    onClick={addVideoUrl}
                    disabled={!newVideoUrl.trim()}
                    className="h-12 px-6 text-sm font-bold bg-gradient-to-r from-blue-600 to-violet-400 text-white rounded-xl hover:bg-gradient-to-r from-blue-600 to-violet-400 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>

                {videoEntries.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {videoEntries.map((video, idx) => (
                      <div 
                        key={video.id}
                        className={`p-4 rounded-xl ${
                          video.status === "error" ? "bg-red-900/20 border border-red-800" :
                          video.status === "done" ? "bg-violet-900/20 border border-violet-800" :
                          "bg-blue-900/20 border border-blue-800"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-5 h-5 flex items-center justify-center bg-gradient-to-r from-blue-600 to-violet-400 text-white text-[10px] font-bold rounded-full">{idx + 1}</span>
                              <p className="text-xs font-mono text-gray-400 truncate">{video.url}</p>
                            </div>
                            {video.status === "analyzing" && (
                              <div className="flex items-center gap-2 mt-2">
                                <div className="flex gap-1">
                                  {[0, 1, 2].map((i) => (
                                    <span key={i} className="w-1.5 h-1.5 bg-gradient-to-r from-blue-600 to-violet-400 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                                  ))}
                                </div>
                                <span className="text-xs font-semibold text-violet-300">Detecting places...</span>
                              </div>
                            )}
                            {video.status === "done" && video.analysis && (
                              <div className="space-y-2 mt-2">
                                {video.analysis.suggestedDestination && (
                                  <div className="flex items-center gap-1.5">
                                    <svg width="12" height="12" fill="none" stroke="#a78bfa" strokeWidth="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                    <span className="text-xs font-bold text-violet-300">{video.analysis.suggestedDestination}</span>
                                  </div>
                                )}
                                {video.analysis.locations.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {video.analysis.locations.map((loc, i) => (
                                      <span key={i} className="px-2 py-1 text-[11px] font-medium bg-gray-800 text-gray-300 rounded-md border border-gray-700">
                                        {loc.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {video.analysis.locations.length === 0 && !video.analysis.suggestedDestination && (
                                  <span className="text-xs text-gray-500">No specific places detected</span>
                                )}
                              </div>
                            )}
                            {video.status === "error" && <span className="text-xs font-semibold text-red-400 mt-2 block">{video.error}</span>}
                          </div>
                          <button onClick={() => removeVideo(video.id)} className="ml-3 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary of all places */}
                {allPlacesFromVideos.length > 0 && (
                  <div className="pt-4 border-t border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <svg width="14" height="14" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                      <span className="text-xs font-bold text-violet-300 uppercase tracking-wide">{allPlacesFromVideos.length} places will be included</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allPlacesFromVideos.map((place, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs font-medium bg-violet-900/30 text-violet-300 rounded-full border border-violet-800">
                          {place.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preferences Panel */}
            {showPreferences && (
              <div className="bg-[#141414] rounded-2xl p-6 space-y-4 border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" fill="none" stroke="#a78bfa" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
                  </div>
                  <span className="text-sm font-bold text-white">Trip preferences</span>
                </div>
                <textarea
                  value={activityPreferences}
                  onChange={(e) => setActivityPreferences(e.target.value)}
                  placeholder="I love trying local street food, visiting museums, no hostels, prefer 4-star hotels..."
                  className="w-full h-28 px-4 py-3 text-sm bg-[#1a1a1a] text-white rounded-xl border border-gray-700 placeholder-gray-500 resize-none focus:border-violet-400 focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-gray-500 mt-2">
                  Tip: Add hotel preferences like "no hostels", "luxury only", or "budget-friendly"
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center gap-4 py-6">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-2.5 h-2.5 bg-gradient-to-r from-blue-600 to-violet-400 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                  ))}
                </div>
                <span className="text-sm font-semibold text-gray-400">
                  {analyzingCount > 0 ? `Analyzing ${analyzingCount} video${analyzingCount > 1 ? 's' : ''}...` : 'Planning your adventure...'}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-4 p-5 bg-red-900/20 rounded-2xl border border-red-800">
                <div className="w-8 h-8 bg-red-900/30 rounded-lg flex items-center justify-center shrink-0">
                  <svg width="16" height="16" fill="none" stroke="#f87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <p className="text-sm font-medium text-red-400 pt-1">{error}</p>
              </div>
            )}

            {/* Suggestions */}
            {!loading && !itineraryPlan && (
              <div className="pt-4 text-center">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Try something like</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Weekend getaway to Paris", "2 weeks in Japan", "Road trip through Iceland"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="px-4 py-2.5 text-sm font-medium text-gray-400 bg-[#1a1a1a] border border-gray-700 rounded-full hover:border-gray-600 hover:text-white transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Sidebar Toggle */}
        {itineraryPlan && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-[#1a1a1a] text-violet-400 rounded-full hover:scale-105 transition-transform z-10 border border-gray-700"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}
