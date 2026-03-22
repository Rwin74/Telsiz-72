import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';

// Define it carefully, fallback to empty strings just to avoid build errors if env not set
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://dummy.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'dummy',
});

// Since we are doing bulk inserts in the worker, we can just use anon key or service role.
// Ideally service role is used in cron.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
);
