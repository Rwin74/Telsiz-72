import { NextResponse } from "next/server";
import { redis, supabase } from "@/lib/clients";

// Cron veya Worker servisi olarak çalışır (Batch Processing)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Redis'ten aynı anda 10.000'e kadar sinyal çek
    const queueKey = "telsiz72:sos_queue";
    const queueLength = await redis.llen(queueKey);

    if (queueLength === 0) {
      return NextResponse.json({ success: true, message: "Queue empty" });
    }

    // LPOP with count (Max 1000 items per batch to avoid limits, loop if needed)
    // Upstash LPOP count parametresini destekler.
    const rawItems = await redis.lpop(queueKey, 1000); 
    
    // Eğer sadece 1 öğe gelirse lpop tek obje dönebilir, diziye çevir
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    if (items.length === 0) {
      return NextResponse.json({ success: true, message: "No items pulled" });
    }

    // Payload map for Supabase
    // payload: { l: lat, g: lng, s: status, created_at: string, payload_size: number, a: number }
    const mappedInserts = items.map((i: any) => {
      const obj = typeof i === "string" ? JSON.parse(i) : i;
      return {
        lat: obj.l,
        lng: obj.g,
        status: obj.s,
        accuracy: obj.a || null,
        created_at: obj.created_at || new Date().toISOString(),
        payload_size: obj.payload_size || 15
      };
    });

    // Supabase Bulk Insert
    let { error, count } = await supabase
      .from("searches")
      .insert(mappedInserts);

    if (error && error.message?.includes("accuracy")) {
      console.warn("Supabase schema missing 'accuracy' column. Retrying without it...");
      const fallbackInserts = mappedInserts.map(item => {
        const { accuracy, ...rest } = item;
        return rest;
      });
      const retryResult = await supabase.from("searches").insert(fallbackInserts);
      error = retryResult.error;
      count = retryResult.count;
    }

    if (error) {
      // Başarısız olursa Redis'e geri at (Dead Letter veya retry logic eklenebilir)
      console.error("Supabase bulk insert error:", error);
      // await redis.lpush(queueKey, ...items); // opsiyonel geri alma
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, processed: items.length });
  } catch (error: any) {
    console.error("Worker failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
