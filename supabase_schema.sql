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
-- You can safely ignore "policy already exists" errors or drop them first.
CREATE POLICY "Allow public inserts" ON public.searches
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public reads" ON public.searches
    FOR SELECT USING (true);

-- Phase 1.5 Requirement: Allow public updates to change status = 2
CREATE POLICY "Allow public updates" ON public.searches
    FOR UPDATE USING (true);

-- Utility Requirement: Allow public deletes to clear the dashboard
CREATE POLICY "Allow public deletes" ON public.searches
    FOR DELETE USING (true);


-- 3. Enable Realtime on the table!
-- This is critical for the Dashboard Socket to receive INSERT events
alter publication supabase_realtime add table public.searches;
