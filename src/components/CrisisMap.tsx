import { useEffect, useRef, Fragment } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet icons issue in Next.js dynamically
import L from "leaflet";
import "leaflet.heat";
import { supabase } from "@/lib/clients";

type Signal = {
  id?: string;
  lat: number;
  lng: number;
  status: number;
  created_at: string;
  accuracy?: number;
  battery?: number;
  ble_count?: number;
  depth?: number;
};

// HeatMap Layer Component
const HeatmapLayer = ({ data }: { data: Signal[] }) => {
  const map = (require("react-leaflet") as any).useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;
    
    // Sadece henüz çözülmemiş Kırmızı acilleri (status=1) ısı haritasına koy
    const heatData = data
      .filter(s => s.status === 1)
      .map(s => [s.lat, s.lng, 1]); // [lat, lng, intensity]

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    if (heatData.length > 0 && typeof (L as any).heatLayer !== 'undefined') {
      try {
        layerRef.current = (L as any).heatLayer(heatData, {
          radius: 25,
          blur: 15,
          maxZoom: 15,
          gradient: { 0.4: 'yellow', 0.6: 'orange', 1: 'red' }
        }).addTo(map);
      } catch (e) {
        // Fallback or ignore if plugin fails
      }
    }

    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [data, map]);

  return null;
};

// Map Navigation Controller
const MapController = ({ flyToProvince }: { flyToProvince: any }) => {
  const map = (require("react-leaflet") as any).useMap();
  useEffect(() => {
    if (flyToProvince) {
      if (flyToProvince.value === "BLIND_SIGNALS") {
         map.flyTo([38.9637, 35.2433], 5, { animate: true, duration: 1.5 });
      } else if (flyToProvince.feature) {
         try {
           const L = require("leaflet");
           const bounds = L.geoJSON(flyToProvince.feature).getBounds();
           map.fitBounds(bounds, { padding: [20, 20], animate: true, duration: 1.5 });
         } catch(e) {}
      }
    } else {
      map.flyTo([38.9637, 35.2433], 6, { animate: true, duration: 1.5 });
    }
  }, [flyToProvince, map]);
  return null;
};

export default function CrisisMap({ signals, flyToProvince, geoJson, onProvinceSelect }: { signals: Signal[], flyToProvince?: any, geoJson?: any, onProvinceSelect?: (name: string) => void }) {
  const defaultCenter: [number, number] = [38.9637, 35.2433];
  
  const resolveCase = async (id: string | undefined) => {
    if (!id) return;
    try {
      await supabase.from("searches").update({ status: 2 }).eq("id", id);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full h-full bg-[#0F172A] relative popup-dark-override">
      {/* Özel Popup stili (leaflet arkaplanını siyaha çekmek için) */}
      <style>{`
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #111827; 
          color: white;
          border: 1px solid #374151;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
        }
      `}</style>
      
      <MapContainer
        center={defaultCenter}
        zoom={6}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <MapController flyToProvince={flyToProvince} />
        
        {geoJson && (
          <GeoJSON 
            data={geoJson}
            key={flyToProvince?.value || 'all'}
            style={(feature: any) => {
              const isSelected = flyToProvince && flyToProvince.value === feature.properties.name;
              return {
                color: isSelected ? '#FF0000' : '#475569',
                weight: isSelected ? 3 : 1,
                fillColor: isSelected ? '#FF0000' : 'transparent',
                fillOpacity: isSelected ? 0.15 : 0,
              };
            }}
            onEachFeature={(feature: any, layer: any) => {
              layer.on({
                click: () => {
                  if (onProvinceSelect) {
                    onProvinceSelect(feature.properties.name);
                  }
                }
              });
            }}
          />
        )}

        <HeatmapLayer data={signals} />

        {signals.map((signal, idx) => {
          if (signal.status === 1) { // KIRMIZI SOS
            return (
               <Fragment key={signal.id || idx}>
                 {signal.accuracy && signal.accuracy > 50 && (
                   <Circle
                     center={[signal.lat, signal.lng]}
                     radius={signal.accuracy}
                     pathOptions={{
                       color: "red",
                       fillColor: "red",
                       fillOpacity: 0.1,
                       weight: 1,
                       dashArray: "4 4"
                     }}
                   />
                 )}
                 <CircleMarker
                  center={[signal.lat, signal.lng]}
                  radius={8}
                  pathOptions={{
                    fillColor: "#FF3333", // Neon Red
                    fillOpacity: 1,
                    color: "rgba(239, 68, 68, 0.4)", // Pulse ring approximation
                    weight: 10,
                  }}
                >
                  <Popup>
                    <div className="flex flex-col gap-2 font-mono p-1 min-w-[200px]">
                      <span className="text-xs font-bold text-slate-300">KOORD: {signal.lat.toFixed(5)}, {signal.lng.toFixed(5)}</span>
                      {signal.accuracy && signal.accuracy > 50 && (
                        <span className="text-xs font-bold text-red-400">⚠️ Hata Payı: ~{signal.accuracy}m</span>
                      )}
                      
                      {/* DONANIM METRİKLERİ */}
                      <div className="telsiz-popup flex flex-col gap-1 border-t border-slate-700/50 pt-2 mt-1">
                        <p className={`text-xs ${signal.battery !== undefined && signal.battery < 15 ? 'text-red-500 font-black animate-pulse' : 'text-emerald-400'}`}>
                          🔋 Şarj: %{signal.battery !== undefined ? signal.battery : 'N/A'}{signal.battery !== undefined && signal.battery < 15 ? ' (KRİTİK)' : ' (NORMAL)'}
                        </p>
                        <p className="text-xs text-cyan-300">
                          🫂 Kümelenme: {signal.ble_count !== undefined ? signal.ble_count : 0} Kişi Tespit
                        </p>
                        <p className="text-xs text-amber-300">
                          📏 Tahmini Derinlik: {signal.depth !== undefined ? signal.depth : 0} Metre
                        </p>
                      </div>

                      <span className="text-xs text-slate-500 border-t border-slate-700/50 pt-1">Zaman: {new Date(signal.created_at).toLocaleTimeString('tr-TR')}</span>
                      <button 
                      onClick={() => resolveCase(signal.id)} 
                      className="mt-2 w-full px-3 py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 font-bold text-[11px] uppercase tracking-wider rounded transition-colors"
                    >
                      ✓ Ekipler Ulaştı / Vakayı Kapat
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
             </Fragment>
            )
          } else if (signal.status === 2) { // KAPANMIŞ / MÜDAHALE EDİLMİŞ
            return (
              <CircleMarker
                key={signal.id || idx}
                center={[signal.lat, signal.lng]}
                radius={5}
                pathOptions={{
                  fillColor: "#6B7280", // Dull Gray
                  fillOpacity: 0.8,
                  color: "transparent",
                  weight: 0,
                }}
              />
            )
          } else { // YEŞİL GÜVENDE
            return (
              <CircleMarker
                key={signal.id || idx}
                center={[signal.lat, signal.lng]}
                radius={4}
                pathOptions={{
                  fillColor: "#10B981", // Neon Green
                  fillOpacity: 0.6,
                  color: "transparent",
                  weight: 0,
                }}
              />
            )
          }
        })}
      </MapContainer>
    </div>
  );
}
