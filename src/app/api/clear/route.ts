import { NextResponse } from "next/server";
import { redis, supabase } from "@/lib/clients";

// Edge Runtime
export const runtime = "edge";

export async function POST() {
  try {
    // 1. Clear Redis Queue
    await redis.del("telsiz72:sos_queue");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Clear error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
