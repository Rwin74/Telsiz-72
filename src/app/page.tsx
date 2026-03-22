"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, AlertOctagon, Loader2 } from "lucide-react";

export default function PanicButtonPage() {
  const [status, setStatus] = useState<"IDLE" | "LOCATING" | "SENDING" | "SENT_RED" | "SENT_GREEN" | "ERROR">("IDLE");
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);

  useEffect(() => {
    const checkCooldown = () => {
      /* TEST SÜRÜMÜ: COOLDOWN İPTAL EDİLDİ
      const lastSosTime = localStorage.getItem("last_sos_time");
      if (lastSosTime) {
        const elapsed = Date.now() - parseInt(lastSosTime);
        const cooldown = 5 * 60 * 1000; // 5 minutes
        if (elapsed < cooldown) {
          setCooldownLeft(Math.floor((cooldown - elapsed) / 1000));
        }
      }
      */
    };
    checkCooldown();
    const interval = setInterval(() => {
      setCooldownLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const sendSignal = async (isEmergency: boolean) => {
    if (cooldownLeft > 0) return;

    setStatus("LOCATING");
    setErrorMsg("");

    if (!navigator.geolocation) {
      setErrorMsg("GPS desteklenmiyor.");
      setStatus("ERROR");
      return;
    }

    const getPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    };

    try {
      let position: GeolocationPosition;
      try {
        // Plan A (Kesin Konum)
        position = await getPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
      } catch (err) {
        // Plan B (Ağ tabanlı Yaklaşık Konum - GPS Fallback)
        position = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
      }

      setStatus("SENDING");
      const lat = parseFloat(position.coords.latitude.toFixed(5));
      const lng = parseFloat(position.coords.longitude.toFixed(5));
      const accuracy = Math.round(position.coords.accuracy);
      const s = isEmergency ? 1 : 0; // 1: SOS (Kırmızı), 0: SAFE (Yeşil)

      // Payload'a a eklendi
      const payload = { l: lat, g: lng, s, a: accuracy };

      try {
        const res = await fetch("/api/sos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Ağ hatası");

        if (isEmergency) {
          setStatus("SENT_RED");
          // TEST SÜRÜMÜ: COOLDOWN İPTAL EDİLDİ
          // localStorage.setItem("last_sos_time", Date.now().toString());
          // setCooldownLeft(5 * 60);
        } else {
          setStatus("SENT_GREEN");
        }

        setTimeout(() => setStatus("IDLE"), 5000);
      } catch (err) {
        console.error(err);
        setErrorMsg("Sinyal gönderilemedi, baştan deneyin.");
        setStatus("ERROR");
        setTimeout(() => setStatus("IDLE"), 4000);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Konum alınamadı. Lütfen GPS izni verin.");
      setStatus("ERROR");
      setTimeout(() => setStatus("IDLE"), 4000);
    }
  };

  return (
    <main className="flex-1 flex flex-col justify-center items-center p-6 gap-8 relative overflow-hidden h-screen bg-[#0F172A]">
      {cooldownLeft > 0 && (
        <div className="absolute top-10 w-11/12 max-w-sm text-center px-4 py-3 bg-slate-800/90 border border-slate-600 rounded-xl backdrop-blur-md shadow-2xl z-50">
          <p className="text-yellow-400 font-bold mb-1">
            Sinyaliniz Kriz Merkezine Ulaştı.
          </p>
          <p className="text-slate-300 text-[13px] leading-tight mt-1">
            Şarjınızı korumak için sistem beklemeye alındı. Yeni sinyal için: <span className="font-mono text-white text-base ml-1">{formatTime(cooldownLeft)}</span>
          </p>
        </div>
      )}

      {/* Kırmızı Buton - YARDIM BEKLİYORUM */}
      <button
        onClick={() => sendSignal(true)}
        disabled={cooldownLeft > 0 || (status !== "IDLE" && status !== "ERROR" && status !== "SENT_GREEN")}
        className="w-full max-w-sm aspect-square bg-red-600 hover:bg-red-500 active:bg-red-700 active:scale-95 disabled:opacity-50 disabled:grayscale rounded-full flex flex-col items-center justify-center gap-4 transition-all shadow-[0_0_80px_rgba(220,38,38,0.4)] relative"
      >
        <AlertOctagon size={80} className="text-white" />
        <span className="text-3xl font-black tracking-wider text-white">YARDIM</span>
        <span className="text-xl font-bold text-white/90 uppercase">Bekliyorum</span>
        
        {/* Pulse Effect */}
        <div className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-20 pointer-events-none" />
      </button>

      {/* Yeşil Buton - GÜVENDEYİM */}
      <button
        onClick={() => sendSignal(false)}
        disabled={cooldownLeft > 0 || (status !== "IDLE" && status !== "ERROR" && status !== "SENT_RED")}
        className="w-full max-w-sm h-32 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:grayscale rounded-3xl flex items-center justify-center gap-4 transition-all shadow-lg"
      >
        <ShieldCheck size={40} className="text-white" />
        <span className="text-2xl font-bold tracking-wide text-white uppercase">Güvendeyim</span>
      </button>

      {/* Durum Göstergesi (Overlay) */}
      {(status !== "IDLE" || errorMsg) && (
        <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md font-mono font-bold text-sm min-w-max shadow-xl transition-all ${
          status === "ERROR" ? "bg-red-500/20 text-red-200 border border-red-500/50" : 
          status === "SENT_RED" || status === "SENT_GREEN" ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/50" :
          "bg-white/10 text-slate-200 border border-white/20"
        }`}>
          {(status === "LOCATING" || status === "SENDING") && <Loader2 size={16} className="animate-spin" />}
          {status === "LOCATING" && "GPS Aranıyor..."}
          {status === "SENDING" && "Sinyal İletiliyor..."}
          {status === "SENT_RED" && "YARDIM SİNYALİ İLETİLDİ."}
          {status === "SENT_GREEN" && "GÜVENDE SİNYALİ İLETİLDİ."}
          {status === "ERROR" && errorMsg}
        </div>
      )}
    </main>
  );
}
