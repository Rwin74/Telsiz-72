"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/clients";
import { ShieldCheck, AlertOctagon, Activity, CheckCircle2 } from "lucide-react";

// React-Leaflet MUST be loaded dynamically with SSR disabled
const CrisisMap = dynamic<{ signals: Signal[], flyTo?: any }>(() => import("../../components/CrisisMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 w-full bg-[#0F172A] flex items-center justify-center">
      <Activity size={48} className="text-slate-500 animate-pulse" />
    </div>
  ),
});

const REGIONS = [
  { name: "📍 Konumu Bilinmeyenler (Kör Sinyaller)", isBlind: true },
  { name: "İstanbul", lat: 41.0082, lng: 28.9784, zoom: 10 },
  { name: "Ankara", lat: 39.9334, lng: 32.8597, zoom: 10 },
  { name: "İzmir", lat: 38.4192, lng: 27.1287, zoom: 10 },
  { name: "Hatay", lat: 36.2023, lng: 36.1613, zoom: 10 },
  { name: "Kahramanmaraş", lat: 37.5753, lng: 36.9228, zoom: 10 },
  { name: "Adıyaman", lat: 37.7644, lng: 38.2763, zoom: 10 },
  { name: "Gaziantep", lat: 37.0662, lng: 37.3833, zoom: 10 },
  { name: "Malatya", lat: 38.3552, lng: 38.3095, zoom: 10 },
  { name: "Adana", lat: 37.0000, lng: 35.3213, zoom: 10 }
];

type Signal = {
  id: string;
  lat: number;
  lng: number;
  status: number; // 0=SAFE, 1=SOS, 2=RESOLVED
  created_at: string;
};

type LogEntry = {
  logId: string;
  time: string;
  lat: number;
  lng: number;
  type: "SOS" | "SAFE" | "RESOLVED";
};

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState({ totalSos: 0, totalSafe: 0, totalResolved: 0 });
  const [filter, setFilter] = useState<"ALL" | "RED_ONLY">("ALL");
  const [selectedRegion, setSelectedRegion] = useState<typeof REGIONS[0] | null>(null);
  const [recoveredIds, setRecoveredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Initial Fetch (limit to recent 5000 for performance on load)
    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from("searches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (data) {
        setSignals(data);
        const sos = data.filter((d) => d.status === 1).length;
        const safe = data.filter((d) => d.status === 0).length;
        const resolved = data.filter((d) => d.status === 2).length;
        setStats({ totalSos: sos, totalSafe: safe, totalResolved: resolved });
      }
    };

    fetchInitial();

    // Setup Supabase Realtime
    const channel = supabase
      .channel("public:searches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "searches" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newSignal = payload.new as Signal;
            setSignals((prev) => [newSignal, ...prev]);

            setStats((prev) => ({
              ...prev,
              totalSos: prev.totalSos + (newSignal.status === 1 ? 1 : 0),
              totalSafe: prev.totalSafe + (newSignal.status === 0 ? 1 : 0),
              totalResolved: prev.totalResolved + (newSignal.status === 2 ? 1 : 0),
            }));
          } else if (payload.eventType === "UPDATE") {
             const updatedSignal = payload.new as Signal;
             
             setSignals((prev) => {
               const oldSignal = prev.find(s => s.id === updatedSignal.id);
               if (oldSignal) {
                 if (oldSignal.status !== 2 && updatedSignal.status === 2) {
                   // Case has been resolved
                   setStats((statsPrev) => ({
                     ...statsPrev,
                     totalSos: Math.max(0, statsPrev.totalSos - 1),
                     totalResolved: statsPrev.totalResolved + 1
                   }));
                 }
                 // Handle Autonomous Location Recovery detection
                 if (oldSignal.lat === 0 && updatedSignal.lat !== 0) {
                    setRecoveredIds(set => {
                       const next = new Set(set);
                       next.add(updatedSignal.id);
                       return next;
                    });
                 }
               }
               return prev.map(s => s.id === updatedSignal.id ? updatedSignal : s);
             });
          } else if (payload.eventType === "DELETE") {
             const deletedSignal = payload.old;
             setSignals((prev) => prev.filter(s => s.id !== deletedSignal.id));
             // Re-calculate stats could be complex here, so we let the full clear handle it for MVP
          }
        }
      )
      .subscribe();

    // MVP HACK: For local testing without a real Cron provider (like Vercel Cron),
    // we let the dashboard ping the worker every 2 seconds to drain Redis queue into Supabase.
    const workerInterval = setInterval(() => {
      fetch("/api/worker").catch(() => {});
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(workerInterval);
    };
  }, []);

  const displayedSignals = signals.filter(s => {
    if (filter === "RED_ONLY" && s.status !== 1) return false;
    
    // Geo-Fencing Filter
    if (selectedRegion) {
      if (selectedRegion.isBlind) {
        return s.lat === 0 && s.lng === 0;
      } else if (selectedRegion.lat && selectedRegion.lng) {
        // approx 50-60km radius
        const latDiff = Math.abs(s.lat - selectedRegion.lat);
        const lngDiff = Math.abs(s.lng - selectedRegion.lng);
        if (latDiff > 0.6 || lngDiff > 0.6) return false;
      }
    }
    return true;
  });

  const handleClearAll = async () => {
    if (confirm("DİKKAT! Tüm kriz verilerini veritabanından SİLMEK istediğine emin misin?")) {
      // 1. Clear Redis
      await fetch("/api/clear", { method: "POST" });
      
      // 2. Clear Supabase
      // Using neq ID to just match all rows
      await supabase.from("searches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      setSignals([]);
      setRecoveredIds(new Set());
      setStats({ totalSos: 0, totalSafe: 0, totalResolved: 0 });
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0F172A] text-slate-100 overflow-hidden font-mono">
      {/* 85% Map Area */}
      <main className="flex-1 relative flex flex-col z-0">
        {/* Top Navbar: Triage Stats */}
        <header className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
          <div className="max-w-5xl mx-auto bg-[#1E293B]/80 backdrop-blur-md border border-slate-700/50 rounded-xl px-6 py-3 flex items-center justify-between shadow-2xl pointer-events-auto">
            <div className="flex gap-8">
              <div className="flex items-center gap-3">
                <AlertOctagon size={24} className="text-red-500 animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Kritik Yardım Çağrısı</span>
                  <span className="text-xl font-bold text-red-100">{stats.totalSos.toLocaleString()}</span>
                </div>
              </div>
              <div className="w-px bg-slate-700"></div>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={24} className="text-slate-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Müdahale Edildi</span>
                  <span className="text-xl font-bold text-slate-200">{stats.totalResolved.toLocaleString()}</span>
                </div>
              </div>
              <div className="w-px bg-slate-700"></div>
              <div className="flex items-center gap-3">
                <ShieldCheck size={24} className="text-emerald-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Güvende Bildirimi</span>
                  <span className="text-xl font-bold text-emerald-100">{stats.totalSafe.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
              <Activity size={14} className="text-green-400" />
              <span className="text-xs font-bold text-green-400">SİSTEM AKTİF (0 Gecikme)</span>
            </div>
          </div>
        </header>

        {/* Floating Filter Controls */}
        <div className="absolute top-24 right-4 z-[1000] flex flex-col gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-4 py-2 text-sm font-bold border rounded-lg transition-all backdrop-blur-md ${filter === "ALL" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700"}`}
          >
            Tüm Sinyaller
          </button>
          <button
            onClick={() => setFilter("RED_ONLY")}
            className={`px-4 py-2 text-sm font-bold border rounded-lg shadow-lg backdrop-blur-md transition-all ${filter === "RED_ONLY" ? "bg-red-500/20 border-red-500 text-red-200" : "bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700"}`}
          >
            Sadece Acilleri Göster
          </button>
          <div className="w-full h-px bg-slate-700/50 my-1"></div>
          
          <select 
             onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (idx === -1) setSelectedRegion(null);
                else setSelectedRegion(REGIONS[idx]);
             }}
             className="px-4 py-2 text-sm font-bold bg-slate-800/80 border border-slate-700 text-slate-300 rounded-lg shadow-lg outline-none cursor-pointer focus:border-blue-500 transition-all backdrop-blur-md"
          >
             <option value="-1">🌍 Tüm Türkiye (Harita)</option>
             {REGIONS.map((r, i) => (
                <option key={r.name} value={i}>{r.name}</option>
             ))}
          </select>

          <div className="w-full h-px bg-slate-700/50 my-1"></div>

          <button
            onClick={handleClearAll}
            className={`px-4 py-2 text-xs font-bold border rounded-lg shadow-lg backdrop-blur-md transition-all bg-red-900/40 border-red-800/80 text-red-400 hover:bg-red-800/80 hover:text-white`}
          >
            🗑️ Ekranı & Veritabanını Temizle
          </button>
        </div>

        {/* Map Component */}
        <CrisisMap signals={displayedSignals} flyTo={selectedRegion} />
      </main>

      {/* 20% Sidebar: Multi-purpose Signal List Area */}
      <aside className="w-96 border-l border-slate-800 bg-[#0F172A] flex flex-col z-50 shadow-2xl">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-xs font-bold text-slate-400 tracking-widest uppercase flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Filtrelenmiş Sinyaller {displayedSignals.length > 0 && `(${displayedSignals.length})`}
            </div>
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {displayedSignals.slice(0, 50).map((signal) => ( // only render top 50 in sidebar
            <div
              key={signal.id}
              className={`text-[11px] font-mono leading-relaxed p-2.5 bg-slate-800/20 hover:bg-slate-800/60 rounded-md cursor-pointer transition-all duration-500 border border-slate-700/30 hover:border-slate-600/50 ${signal.status === 2 ? 'opacity-40 grayscale' : ''}`}
            >
              <div className="text-slate-500 mb-1 flex justify-between items-center">
                 <span>ID: {signal.id?.substring(0, 8)}...</span>
                 <span>{new Date(signal.created_at).toLocaleTimeString('tr-TR')}</span>
              </div>
              
              {signal.status === 1 ? (
                signal.lat === 0 && signal.lng === 0 ? (
                  <div className="text-red-500 font-bold animate-pulse mt-1">
                    🔴 ULAŞILAMIYOR<br/><span className="text-[10px] text-red-400/80">(Kör Sinyal - Otonom Güncelleme Bekleniyor)</span>
                  </div>
                ) : recoveredIds.has(signal.id) ? (
                  <div className="text-emerald-400 font-bold animate-pulse mt-1">
                    🟢 GÜNCEL KONUM ALINDI<br/><span className="text-[10px] text-emerald-500/80">Otonom Koordinat: {signal.lat.toFixed(4)}, {signal.lng.toFixed(4)}</span>
                  </div>
                ) : (
                  <div className="text-red-400 font-bold mt-1">
                    🔴 ACİL<br/><span className="text-[10px] text-red-300">KOORD: {signal.lat.toFixed(4)}, {signal.lng.toFixed(4)}</span>
                  </div>
                )
              ) : signal.status === 2 ? (
                <div className="text-slate-400 font-bold mt-1">
                  ⚪ MÜDAHALE EDİLDİ<br/><span className="text-[10px] text-slate-500">{signal.lat.toFixed(4)}, {signal.lng.toFixed(4)}</span>
                </div>
              ) : (
                <div className="text-emerald-500/90 font-bold mt-1">
                  🟢 GÜVENDE<br/><span className="text-[10px] text-emerald-600/80">KOORD: {signal.lat.toFixed(4)}, {signal.lng.toFixed(4)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
