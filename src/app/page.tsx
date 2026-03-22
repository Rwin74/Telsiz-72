"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, AlertOctagon, Loader2, MapPin } from "lucide-react";

export default function PanicButtonPage() {
  const [status, setStatus] = useState<"IDLE" | "LOCATING" | "SENDING" | "SENT_RED" | "SENT_GREEN" | "ERROR">("IDLE");
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);
  const [permissionState, setPermissionState] = useState<PermissionState | "loading">("loading");

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        setPermissionState(result.state);
        result.addEventListener('change', () => {
          setPermissionState(result.state);
        });
      }).catch(() => {
        setPermissionState("prompt");
      });
    } else {
      setPermissionState("prompt");
    }
  }, []);

  const requestPermission = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setPermissionState("granted");
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState("denied");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  useEffect(() => {
    const checkCooldown = () => {
      /* TEST SÜRÜMÜ: COOLDOWN İPTAL EDİLDİ
      const lastSosTime = localStorage.getItem("last_sos_time");
      if (lastSosTime) {
        ...
      }
      */
    };
    checkCooldown();
    const interval = setInterval(() => {
      setCooldownLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Otonom Konum Düzeltme (Self-Correcting Payload)
  useEffect(() => {
    const handleOnlineRecovery = () => {
      const isPending = localStorage.getItem("pending_blind_sos");
      if (isPending !== "true") return;

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = parseFloat(position.coords.latitude.toFixed(5));
            const lng = parseFloat(position.coords.longitude.toFixed(5));
            const accuracy = Math.round(position.coords.accuracy);

            try {
              const activeSignalId = localStorage.getItem("active_signal_id");
              if (!activeSignalId) return;

              const recoveryPayload = {
                id: activeSignalId,
                l: lat,
                g: lng,
                a: accuracy,
                is_recovery: true,
                recovered_at: new Date().toISOString()
              };

              // Supabase / Backend için PATCH isteği
              const response = await fetch("/api/sos", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(recoveryPayload),
              });

              if (response.ok) {
                localStorage.setItem("pending_blind_sos", "false");
                console.log("Otonom Kurtarma Başarılı: Kör veri ezildi!");
              }
            } catch (err) {
              console.error("Kurtarma (Patch) hatası:", err);
            }
          },
          (err) => {
            console.error("Kurtarma konum hatası:", err);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
      }
    };

    window.addEventListener("online", handleOnlineRecovery);
    
    // Eğer app açıldığında zaten online ise hemen kontrol et
    if (typeof window !== "undefined" && navigator.onLine) {
      handleOnlineRecovery();
    }

    return () => {
      window.removeEventListener("online", handleOnlineRecovery);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const sendSignal = async (isEmergency: boolean) => {
    // if (cooldownLeft > 0) return;

    setStatus("LOCATING");
    setErrorMsg("");

    let lat = 0, lng = 0, accuracy = -1;

    if (navigator.geolocation) {
      const getPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
      };

      try {
        let position: GeolocationPosition;
        try {
          // Plan A (Kesin Konum) timeout: 5000
          position = await getPosition({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
        } catch (err) {
          // Plan B (Ağ tabanlı Yaklaşık Konum) timeout: 2000 (To max out at 7s total)
          position = await getPosition({ enableHighAccuracy: false, timeout: 2000, maximumAge: 0 });
        }

        lat = parseFloat(position.coords.latitude.toFixed(5));
        lng = parseFloat(position.coords.longitude.toFixed(5));
        accuracy = Math.round(position.coords.accuracy);

        // Save last known location for severe GPS blackouts
        localStorage.setItem("last_known_lat", lat.toString());
        localStorage.setItem("last_known_lng", lng.toString());
      } catch (err) {
        // Plan C: FATAL GPS ERROR (No-Matter-What Protocol)
        const lastLat = localStorage.getItem("last_known_lat");
        const lastLng = localStorage.getItem("last_known_lng");
        if (lastLat && lastLng) {
          lat = parseFloat(lastLat);
          lng = parseFloat(lastLng);
          accuracy = 9999; // Represents historical fallback
        }
      }
    } else {
      // GPS not supported at all
      const lastLat = localStorage.getItem("last_known_lat");
      const lastLng = localStorage.getItem("last_known_lng");
      if (lastLat && lastLng) {
        lat = parseFloat(lastLat);
        lng = parseFloat(lastLng);
        accuracy = 9999;
      }
    }

    // GUARANTEED EXECUTION:
    setStatus("SENDING");
    
    let activeSignalId = localStorage.getItem("active_signal_id");
    if (isEmergency && !activeSignalId) {
      activeSignalId = crypto.randomUUID();
      localStorage.setItem("active_signal_id", activeSignalId);
    } else if (!isEmergency) {
      activeSignalId = crypto.randomUUID();
      localStorage.removeItem("active_signal_id");
    }

    const s = isEmergency ? 1 : 0; // 1: SOS (Kırmızı), 0: SAFE (Yeşil)
    const payload = { id: activeSignalId, l: lat, g: lng, s, a: accuracy };

    try {
      const res = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Ağ hatası");

      if (isEmergency) {
        setStatus("SENT_RED");
        
        // Kör veri (Offline 0,0) durumu ise bayrakları kilitliyoruz.
        if (accuracy === 9999 || accuracy === -1) {
          localStorage.setItem("pending_blind_sos", "true");
          localStorage.setItem("last_sos_time", Date.now().toString());
        } else {
          localStorage.setItem("pending_blind_sos", "false");
        }
        
        // TEST SÜRÜMÜ: COOLDOWN İPTAL EDİLDİ
        // localStorage.setItem("last_sos_time", Date.now().toString());
        // setCooldownLeft(5 * 60);
      } else {
        setStatus("SENT_GREEN");
      }

      if (accuracy === 9999 || accuracy === -1) {
        setErrorMsg("Konum bulunamadı, ama sinyal hafızaya kilitlendi!");
      }

      setTimeout(() => { setStatus("IDLE"); setErrorMsg(""); }, 5000);
    } catch (err) {
      console.error(err);
      setErrorMsg("Sinyal gönderilemedi, baştan deneyin.");
      setStatus("ERROR");
      setTimeout(() => { setStatus("IDLE"); setErrorMsg(""); }, 4000);
    }
  };

  if (permissionState === "loading") {
    return (
      <main className="flex-1 flex flex-col justify-center items-center p-6 bg-[#0F172A] h-screen text-slate-400 gap-4">
        <Loader2 className="animate-spin text-slate-500" size={48} />
        <p className="font-mono text-sm tracking-widest uppercase">Sistem Hazırlanıyor...</p>
      </main>
    );
  }

  if (permissionState === "denied") {
    return (
      <main className="flex-1 flex flex-col justify-center items-center p-6 bg-red-600 h-screen text-white text-center">
        <AlertOctagon size={100} className="mb-6 opacity-90 animate-pulse" />
        <h1 className="text-4xl font-black mb-4 uppercase tracking-wider">DİKKAT!</h1>
        <p className="text-xl font-bold max-w-md leading-relaxed">
          Konum iznini reddettiniz. Sistem çalışamaz. <br/><br/> Lütfen tarayıcı ayarlarından izni manuel olarak açın.
        </p>
      </main>
    );
  }

  if (permissionState === "prompt") {
    return (
      <main className="flex-1 flex flex-col justify-center items-center p-6 bg-[#0F172A] h-screen text-center">
        <div className="bg-slate-800/80 p-8 rounded-[2rem] border border-slate-700 max-w-sm shadow-2xl flex flex-col items-center">
          <div className="bg-blue-500/20 p-6 rounded-full border border-blue-500/30 mb-6">
            <MapPin size={60} className="text-blue-400" />
          </div>
          <h1 className="text-white text-2xl font-black mb-4 uppercase tracking-wide">Sistem Kurulumu</h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">
            Acil durumlarda size ulaşabilmemiz için konum bilginize ihtiyacımız var. Panik anında zaman kaybetmemek için izni şimdi verin.
          </p>
          <button 
            onClick={requestPermission}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black py-5 px-6 rounded-2xl transition-all shadow-lg active:scale-95 flex flex-col items-center justify-center gap-1 leading-tight"
          >
            <span>KONUM İZNİ VER VE</span>
            <span>SİSTEMİ AKTİF ET</span>
          </button>
        </div>
      </main>
    );
  }

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
          {status === "SENT_RED" && (errorMsg || "YARDIM SİNYALİ İLETİLDİ.")}
          {status === "SENT_GREEN" && (errorMsg || "GÜVENDE SİNYALİ İLETİLDİ.")}
          {status === "ERROR" && errorMsg}
        </div>
      )}
    </main>
  );
}
