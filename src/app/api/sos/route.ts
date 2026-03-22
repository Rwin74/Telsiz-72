import { NextResponse } from "next/server";
import { redis } from "@/lib/clients";

// Veritabanı kilitlemesini engellemek için Edge Runtime kullanıyoruz.
export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // 15 Bayt Kuralı Validasyonu (Lat, Lng, Status)
    if (typeof payload.l !== "number" || typeof payload.g !== "number" || typeof payload.s !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const byteSize = new Blob([JSON.stringify(payload)]).size;
    const finalPayload = { ...payload, created_at: new Date().toISOString(), payload_size: byteSize };

    // Sinyali cihaza en yakın noktada Redis Queue'ya at
    await redis.lpush("telsiz72:sos_queue", JSON.stringify(finalPayload));

    // Zero-latency response
    return NextResponse.json({ success: true, message: "Signal received by Edge." });
  } catch (error) {
    console.error("SOS Ingestion Error", error);
    return NextResponse.json({ error: "Edge function failed" }, { status: 500 });
  }
}
