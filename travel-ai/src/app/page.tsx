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
        itineraryPrompt += `\n\nPlaces from travel videos to include:\n${allLocations.map((loc) => `- ${loc}`).join("\n")}`;
      }
      if (allCaptions.length > 0) {
        itineraryPrompt += `\n\nContext from videos:\n${allCaptions.map((c, i) => `${i + 1}. "${c}"`).join("\n")}`;
      }
      if (activityPreferences.trim()) {
        itineraryPrompt += `\n\nUser preferences: ${activityPreferences.trim()}`;
      }
      itineraryPrompt += "\n\nCreate a detailed day-by-day itinerary.";

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setGeneratingItinerary(false);
    }
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

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#f7f7f8' }}>
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full bg-white z-30 transition-all duration-300 ease-out overflow-hidden ${sidebarOpen ? 'w-[380px]' : 'w-0'}`}
        style={{ boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.12)' : 'none' }}
      >
        <div className="w-[380px] h-full flex flex-col">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Your Itinerary</span>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
                      <span key={i} className="w-2 h-2 bg-gray-800 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                    ))}
                  </div>
                  <span className="text-sm text-gray-500">Creating your itinerary...</span>
                </div>
              </div>
            ) : itineraryPlan ? (
              <div className="space-y-6">
                {/* Summary Card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100">
                  <h3 className="text-xl font-bold text-gray-900">{itineraryPlan.destination}</h3>
                  <p className="text-sm text-gray-500 mt-1">{itineraryPlan.dates}</p>
                  {itineraryPlan.budget && (
                    <span className="inline-block mt-3 px-3 py-1 text-xs font-semibold text-gray-600 bg-white rounded-full border border-gray-200">
                      {itineraryPlan.budget}
                    </span>
                  )}
                </div>

                {/* Days */}
                <div className="space-y-6">
                  {itineraryPlan.itinerary.map((day) => (
                    <div key={day.day} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white text-xs font-bold rounded-full">
                          {day.day}
                        </span>
                        <h4 className="text-sm font-bold text-gray-900">{day.title}</h4>
                      </div>
                      <div className="ml-11 space-y-4">
                        {day.morning.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Morning</p>
                            <ul className="space-y-1.5">
                              {day.morning.map((item, i) => (
                                <li key={i} className="text-sm text-gray-600 flex gap-2">
                                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full mt-2 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {day.afternoon.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Afternoon</p>
                            <ul className="space-y-1.5">
                              {day.afternoon.map((item, i) => (
                                <li key={i} className="text-sm text-gray-600 flex gap-2">
                                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full mt-2 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {day.evening.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Evening</p>
                            <ul className="space-y-1.5">
                              {day.evening.map((item, i) => (
                                <li key={i} className="text-sm text-gray-600 flex gap-2">
                                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full mt-2 shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-[380px]' : 'ml-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-6 bg-[#f7f7f8] border-b border-gray-200/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center">
              <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>
              </svg>
            </div>
            <span className="text-base font-bold text-gray-900">sidequest</span>
          </div>
          {(itineraryPlan || flightParams) && (
            <button onClick={resetSearch} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-all">
              New trip
            </button>
          )}
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 py-16">
          <div className="w-full max-w-xl space-y-10">
            {/* Hero */}
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight">tell me about your next sidequest.</h1>
              <p className="text-lg text-gray-500">Describe your dream trip and I'll create a personalized itinerary.</p>
            </div>

            {/* Main Input */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div 
                className="relative bg-white rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)' }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Plan a trip from NYC to Tokyo, March 15-22..."
                  disabled={loading}
                  className="w-full h-14 pl-5 pr-28 text-base text-gray-900 bg-white placeholder-gray-400 border-0 focus:ring-0 focus:outline-none"
                  style={{ fontSize: '16px' }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                    </svg>
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="w-10 h-10 flex items-center justify-center bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
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
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ boxShadow: showVideoInput || videoEntries.length > 0 ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.08)' }}
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
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ boxShadow: showPreferences || activityPreferences ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.08)' }}
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
              <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" fill="none" stroke="#666" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                  </div>
                  <span className="text-sm font-bold text-gray-800">Add videos for inspiration</span>
                </div>
                
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Paste Instagram Reel or TikTok URL..."
                    className="flex-1 h-12 px-4 text-sm bg-gray-50 rounded-xl border border-gray-200 placeholder-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none transition-colors"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVideoUrl(); }}}
                  />
                  <button
                    type="button"
                    onClick={addVideoUrl}
                    disabled={!newVideoUrl.trim()}
                    className="h-12 px-6 text-sm font-bold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                  >
                    Add
                  </button>
                </div>

                {videoEntries.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {videoEntries.map((video) => (
                      <div 
                        key={video.id}
                        className={`flex items-start justify-between p-4 rounded-xl ${
                          video.status === "error" ? "bg-red-50 border border-red-100" :
                          video.status === "done" ? "bg-emerald-50 border border-emerald-100" :
                          "bg-blue-50 border border-blue-100"
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-xs font-mono text-gray-600 truncate">{video.url}</p>
                          {video.status === "analyzing" && (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {[0, 1, 2].map((i) => (
                                  <span key={i} className="w-1.5 h-1.5 bg-blue-500 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                                ))}
                              </div>
                              <span className="text-xs font-semibold text-blue-600">Analyzing...</span>
                            </div>
                          )}
                          {video.status === "done" && video.analysis?.suggestedDestination && (
                            <div className="flex items-center gap-2">
                              <svg width="14" height="14" fill="none" stroke="#059669" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                              <span className="text-xs font-bold text-emerald-700">{video.analysis.suggestedDestination}</span>
                            </div>
                          )}
                          {video.status === "error" && <span className="text-xs font-semibold text-red-600">{video.error}</span>}
                        </div>
                        <button onClick={() => removeVideo(video.id)} className="ml-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preferences Panel */}
            {showPreferences && (
              <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" fill="none" stroke="#666" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
                  </div>
                  <span className="text-sm font-bold text-gray-800">Trip preferences</span>
                </div>
                <textarea
                  value={activityPreferences}
                  onChange={(e) => setActivityPreferences(e.target.value)}
                  placeholder="I love trying local street food, visiting museums, and finding hidden gems..."
                  className="w-full h-28 px-4 py-3 text-sm bg-gray-50 rounded-xl border border-gray-200 placeholder-gray-400 resize-none focus:border-gray-400 focus:bg-white focus:outline-none transition-colors"
                />
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center gap-4 py-6">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-2.5 h-2.5 bg-gray-800 rounded-full" style={{ animation: `bounce-dot 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                  ))}
                </div>
                <span className="text-sm font-semibold text-gray-500">
                  {analyzingCount > 0 ? `Analyzing ${analyzingCount} video${analyzingCount > 1 ? 's' : ''}...` : 'Planning your adventure...'}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-4 p-5 bg-red-50 rounded-2xl border border-red-100">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg width="16" height="16" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <p className="text-sm font-medium text-red-700 pt-1">{error}</p>
              </div>
            )}

            {/* Suggestions */}
            {!loading && !itineraryPlan && (
              <div className="pt-4 text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Try something like</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Weekend getaway to Paris", "2 weeks in Japan", "Road trip through Iceland"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-full hover:border-gray-300 hover:text-gray-900 transition-colors"
                      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
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
            className="fixed left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-white rounded-full hover:scale-105 transition-transform z-10"
            style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.1)' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}
