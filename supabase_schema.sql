-- Telsiz-72 
-- Supabase Schema & Realtime Setup

-- 1. Create the searches table safely (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.searches (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    lat FLOAT8 NOT NULL,
    lng FLOAT8 NOT NULL,
    status SMALLINT NOT NULL, -- 0=SAFE, 1=SOS, 2=RESOLVED
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload_size INTEGER NOT NULL DEFAULT 15,
    CONSTRAINT searches_pkey PRIMARY KEY (id)
);

-- 2. Turn on Row Level Security (RLS) but allow anonymous inserts, updates, and reads for MVP
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;

-- Note: If these policies already exist, running them again might throw an error. 
-- We use DROP POLICY IF EXISTS to safely re-run this script.
DROP POLICY IF EXISTS "Allow public inserts" ON public.searches;
CREATE POLICY "Allow public inserts" ON public.searches
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public reads" ON public.searches;
CREATE POLICY "Allow public reads" ON public.searches
    FOR SELECT USING (true);

-- Phase 1.5 Requirement: Allow public updates to change status = 2
DROP POLICY IF EXISTS "Allow public updates" ON public.searches;
CREATE POLICY "Allow public updates" ON public.searches
    FOR UPDATE USING (true);

-- Utility Requirement: Allow public deletes to clear the dashboard
DROP POLICY IF EXISTS "Allow public deletes" ON public.searches;
CREATE POLICY "Allow public deletes" ON public.searches
    FOR DELETE USING (true);


-- 3. Enable Realtime on the table!
-- This is critical for the Dashboard Socket to receive INSERT events
DO $$ 
BEGIN 
  ALTER PUBLICATION supabase_realtime ADD TABLE public.searches; 
EXCEPTION WHEN OTHERS THEN 
  raise notice 'Table might already be in publication'; 
END $$;

-- 4. Phase 2 Hardware Metrics (1-Byte compressable values)
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS battery SMALLINT DEFAULT 100;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS ble_count SMALLINT DEFAULT 0;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS depth SMALLINT DEFAULT 0;
