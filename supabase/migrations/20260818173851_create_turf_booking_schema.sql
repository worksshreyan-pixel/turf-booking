/*
# Turf Booking System — Initial Schema

1. Overview
   This migration creates the core schema for a turf booking management system.
   It is a single-tenant app with NO customer login and NO owner login,
   so all policies use `TO anon, authenticated` with `USING (true)` because
   the data is intentionally public/shared (anyone can book, anyone can view).

2. New Tables
   - `turfs`
     - id (uuid, PK)
     - name (text, not null) — display name of the turf facility
     - location (text, not null) — city/area
     - price_per_hour (integer, not null) — price in rupees per hour
     - opening_time (time, not null) — daily opening time
     - closing_time (time, not null) — daily closing time
     - slot_duration_minutes (integer, not null, default 60) — length of each slot
     - created_at (timestamptz, default now())
     - updated_at (timestamptz, default now())

   - `grounds`
     - id (uuid, PK)
     - turf_id (uuid, FK -> turfs.id ON DELETE CASCADE)
     - name (text, not null) — e.g. "Turf 1"
     - created_at (timestamptz, default now())

   - `bookings`
     - id (uuid, PK)
     - ground_id (uuid, FK -> grounds.id ON DELETE CASCADE)
     - turf_id (uuid, FK -> turfs.id) — denormalized for convenient queries
     - booking_date (date, not null) — the date of the booking
     - start_time (time, not null) — slot start
     - end_time (time, not null) — slot end
     - customer_name (text) — null for blocked slots
     - customer_phone (text) — null for blocked slots
     - status (text, not null, default 'confirmed') — 'confirmed' | 'cancelled' | 'blocked'
     - payment_status (text, not null, default 'pending') — 'pending' | 'paid'
     - source (text, not null, default 'customer') — 'customer' | 'owner'
     - created_at (timestamptz, default now())
     - updated_at (timestamptz, default now())

3. Indexes
   - bookings lookup by ground + date (most frequent query pattern)
   - turf_id on bookings for dashboard aggregation
   - unique constraint to prevent double-booking at the DB level:
     one active (non-cancelled) booking per ground + date + start_time

4. Security
   - RLS enabled on all three tables.
   - All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
     because this is a no-auth single-tenant app: customers book without login,
     the owner dashboard is open, and all data is intentionally shared.

5. Important Notes
   - The unique partial index on bookings ensures that even under concurrent
     inserts, a slot cannot be double-booked. Cancelled bookings are excluded
     so the slot becomes available again after cancellation.
   - `updated_at` is maintained via a trigger so callers never need to set it.
*/

-- ===== TURFS =====
CREATE TABLE IF NOT EXISTS turfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  price_per_hour integer NOT NULL,
  opening_time time NOT NULL,
  closing_time time NOT NULL,
  slot_duration_minutes integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE turfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_turfs" ON turfs;
CREATE POLICY "anon_select_turfs" ON turfs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_turfs" ON turfs;
CREATE POLICY "anon_insert_turfs" ON turfs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_turfs" ON turfs;
CREATE POLICY "anon_update_turfs" ON turfs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_turfs" ON turfs;
CREATE POLICY "anon_delete_turfs" ON turfs FOR DELETE
  TO anon, authenticated USING (true);

-- ===== GROUNDS =====
CREATE TABLE IF NOT EXISTS grounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id uuid NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE grounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_grounds" ON grounds;
CREATE POLICY "anon_select_grounds" ON grounds FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_grounds" ON grounds;
CREATE POLICY "anon_insert_grounds" ON grounds FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_grounds" ON grounds;
CREATE POLICY "anon_update_grounds" ON grounds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_grounds" ON grounds;
CREATE POLICY "anon_delete_grounds" ON grounds FOR DELETE
  TO anon, authenticated USING (true);

-- ===== BOOKINGS =====
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ground_id uuid NOT NULL REFERENCES grounds(id) ON DELETE CASCADE,
  turf_id uuid NOT NULL REFERENCES turfs(id),
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'blocked')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  source text NOT NULL DEFAULT 'customer' CHECK (source IN ('customer', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bookings" ON bookings;
CREATE POLICY "anon_select_bookings" ON bookings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
CREATE POLICY "anon_insert_bookings" ON bookings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bookings" ON bookings;
CREATE POLICY "anon_update_bookings" ON bookings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bookings" ON bookings;
CREATE POLICY "anon_delete_bookings" ON bookings FOR DELETE
  TO anon, authenticated USING (true);

-- Index for the most common query: bookings for a ground on a date
CREATE INDEX IF NOT EXISTS idx_bookings_ground_date ON bookings (ground_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_turf_date ON bookings (turf_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);

-- Prevent double-booking: only one active (non-cancelled) booking per slot
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_booking_per_slot
  ON bookings (ground_id, booking_date, start_time)
  WHERE status IN ('confirmed', 'blocked');

-- ===== updated_at trigger =====
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turfs_updated_at ON turfs;
CREATE TRIGGER trg_turfs_updated_at BEFORE UPDATE ON turfs
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ===== SEED DATA =====
-- Demo turf: Smash Arena, Solapur
INSERT INTO turfs (name, location, price_per_hour, opening_time, closing_time, slot_duration_minutes)
VALUES ('Smash Arena', 'Solapur', 800, '06:00', '23:00', 60)
ON CONFLICT DO NOTHING;

-- Ground: Turf 1 (linked to Smash Arena)
INSERT INTO grounds (turf_id, name)
SELECT id, 'Turf 1' FROM turfs WHERE name = 'Smash Arena'
ON CONFLICT DO NOTHING;

-- Seed sample bookings for today and tomorrow
DO $$
DECLARE
  v_turf_id uuid;
  v_ground_id uuid;
  v_today date := current_date;
  v_tomorrow date := current_date + 1;
BEGIN
  SELECT id INTO v_turf_id FROM turfs WHERE name = 'Smash Arena';
  SELECT id INTO v_ground_id FROM grounds WHERE turf_id = v_turf_id AND name = 'Turf 1';

  -- Today: a couple of confirmed bookings
  INSERT INTO bookings (ground_id, turf_id, booking_date, start_time, end_time, customer_name, customer_phone, status, payment_status, source)
  VALUES
    (v_ground_id, v_turf_id, v_today, '07:00', '08:00', 'Rahul Sharma', '9876543210', 'confirmed', 'paid', 'customer'),
    (v_ground_id, v_turf_id, v_today, '18:00', '19:00', 'Priya Patil', '9822334455', 'confirmed', 'pending', 'customer')
  ON CONFLICT DO NOTHING;

  -- Tomorrow: one confirmed booking
  INSERT INTO bookings (ground_id, turf_id, booking_date, start_time, end_time, customer_name, customer_phone, status, payment_status, source)
  VALUES
    (v_ground_id, v_turf_id, v_tomorrow, '06:00', '07:00', 'Amit Deshmukh', '9900112233', 'confirmed', 'pending', 'owner')
  ON CONFLICT DO NOTHING;
END $$;
