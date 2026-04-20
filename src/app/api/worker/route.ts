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

    const validItems: any[] = [];
    const deadLetterItems: any[] = [];

    items.forEach((i: any) => {
      try {
        const obj = typeof i === "string" ? JSON.parse(i) : i;
        if (!obj.id) throw new Error("Missing ID");
        validItems.push({
          id: obj.id,
          lat: obj.l !== undefined ? obj.l : 0,
          lng: obj.g !== undefined ? obj.g : 0,
          status: obj.s !== undefined ? obj.s : 1,
          accuracy: obj.a || null,
          battery: obj.b !== undefined ? obj.b : 100,
          ble_count: obj.bc !== undefined ? obj.bc : 0,
          depth: obj.d !== undefined ? obj.d : 0,
          created_at: obj.created_at || new Date().toISOString(),
          payload_size: obj.payload_size || 15
        });
      } catch (e: any) {
        deadLetterItems.push({ raw: i, error: e.message });
      }
    });

    if (deadLetterItems.length > 0) {
      await redis.lpush("telsiz72:dead_letter_queue", JSON.stringify({ reason: "parse_error", items: deadLetterItems }));
    }

    if (validItems.length === 0) {
      return NextResponse.json({ success: true, message: "No valid items to insert" });
    }

    // Supabase Bulk Upsert
    let { error, count } = await supabase
      .from("searches")
      .upsert(validItems, { onConflict: "id" });

    if (error && error.message?.includes("accuracy")) {
      console.warn("Supabase schema missing 'accuracy' column. Retrying without it...");
      const fallbackInserts = validItems.map(item => {
        const { accuracy, ...rest } = item;
        return rest;
      });
      const retryResult = await supabase.from("searches").upsert(fallbackInserts, { onConflict: "id" });
      error = retryResult.error;
      count = retryResult.count;
    }

    if (error) {
      // Başarısız olursa Redis Dead Letter Queue içine yedekle ki veri tamamen YOK OLMASIN
      console.error("Supabase bulk insert error:", error);
      await redis.lpush("telsiz72:dead_letter_queue", JSON.stringify({ reason: "supabase_error", error, items: validItems }));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, processed: items.length });
  } catch (error: any) {
    console.error("Worker failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
