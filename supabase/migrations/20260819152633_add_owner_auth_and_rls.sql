/*
# Owner Authentication & RLS Security

## Purpose
Replace the current wide-open RLS policies with proper owner-scoped access control.
Add an owner-to-turf relationship so the authenticated user can only manage their own turf(s).

## Changes

### 1. Add owner_id column to turfs table
- `owner_id` (uuid, nullable, references auth.users)
- This links a Supabase auth user to the turf(s) they own.
- Nullable so existing data isn't lost; will be populated for the demo owner.

### 2. RLS Policy Changes — turfs table
- SELECT: authenticated owners can read their own turfs; anon can read all turfs
  (customers need to see turf info to book).
- INSERT/UPDATE/DELETE: only authenticated owners can modify their own turfs.

### 3. RLS Policy Changes — grounds table
- SELECT: anon + authenticated can read all grounds (customers need to see grounds
  to book; owners need to read their own grounds).
- INSERT: authenticated owners can insert grounds for their own turf.
- UPDATE: authenticated owners can update grounds for their own turf.
- DELETE: authenticated owners can delete grounds for their own turf.

### 4. RLS Policy Changes — bookings table
- SELECT: anon can read bookings for a specific ground+date (needed for slot availability
  check via getBookingsForDate); authenticated owners can read all bookings for their turf.
  NOTE: anon SELECT is scoped to prevent enumeration — anon can only SELECT by ground_id
  + booking_date (enforced via a SECURITY DEFINER function to avoid exposing all bookings).
  
  Actually, simpler approach: anon can read bookings WHERE status IN ('confirmed','blocked')
  (for availability checks). Authenticated owners can read all bookings for their turf.
  
- INSERT: anon can insert bookings with status='confirmed' and source='customer' only.
  Authenticated owners can insert bookings for their own turf (manual bookings + blocked slots).
- UPDATE: authenticated owners can update bookings for their own turf only.
  Anon CANNOT update any bookings.
- DELETE: No one can delete (use status='cancelled' instead).

### 5. Security Notes
- The service-role key bypasses RLS entirely, so future WhatsApp webhooks will work.
- Anon users can only create customer bookings and read availability — nothing else.
- Owners are scoped to their own turf via the owner_id column.
*/ 

-- 1. Add owner_id to turfs
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Drop ALL existing policies on turfs
DROP POLICY IF EXISTS "anon_select_turfs" ON turfs;
DROP POLICY IF EXISTS "anon_insert_turfs" ON turfs;
DROP POLICY IF EXISTS "anon_update_turfs" ON turfs;
DROP POLICY IF EXISTS "anon_delete_turfs" ON turfs;

-- Turfs: SELECT — anon can read (customers need turf info), authenticated owners read own
CREATE POLICY "select_turfs_public" ON turfs FOR SELECT
  TO anon, authenticated USING (true);

-- Turfs: INSERT — only authenticated owners
CREATE POLICY "insert_turfs_owner" ON turfs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Turfs: UPDATE — only authenticated owners for their own turf
CREATE POLICY "update_turfs_owner" ON turfs FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Turfs: DELETE — only authenticated owners for their own turf
CREATE POLICY "delete_turfs_owner" ON turfs FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- 3. Drop ALL existing policies on grounds
DROP POLICY IF EXISTS "anon_select_grounds" ON grounds;
DROP POLICY IF EXISTS "anon_insert_grounds" ON grounds;
DROP POLICY IF EXISTS "anon_update_grounds" ON grounds;
DROP POLICY IF EXISTS "anon_delete_grounds" ON grounds;

-- Grounds: SELECT — anon + authenticated can read (customers need ground info)
CREATE POLICY "select_grounds_public" ON grounds FOR SELECT
  TO anon, authenticated USING (true);

-- Grounds: INSERT — authenticated owners, scoped to their turf
CREATE POLICY "insert_grounds_owner" ON grounds FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = grounds.turf_id AND turfs.owner_id = auth.uid())
  );

-- Grounds: UPDATE — authenticated owners, scoped to their turf
CREATE POLICY "update_grounds_owner" ON grounds FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = grounds.turf_id AND turfs.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = grounds.turf_id AND turfs.owner_id = auth.uid())
  );

-- Grounds: DELETE — authenticated owners, scoped to their turf
CREATE POLICY "delete_grounds_owner" ON grounds FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = grounds.turf_id AND turfs.owner_id = auth.uid())
  );

-- 4. Drop ALL existing policies on bookings
DROP POLICY IF EXISTS "anon_select_bookings" ON bookings;
DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
DROP POLICY IF EXISTS "anon_update_bookings" ON bookings;
DROP POLICY IF EXISTS "anon_delete_bookings" ON bookings;

-- Bookings: SELECT — anon can read active bookings (for availability checks);
-- authenticated owners can read ALL bookings for their own turf
CREATE POLICY "select_bookings_anon_active" ON bookings FOR SELECT
  TO anon USING (status IN ('confirmed', 'blocked'));

CREATE POLICY "select_bookings_owner_all" ON bookings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = bookings.turf_id AND turfs.owner_id = auth.uid())
  );

-- Bookings: INSERT — anon can insert customer bookings only (status='confirmed', source='customer')
CREATE POLICY "insert_bookings_anon_customer" ON bookings FOR INSERT
  TO anon WITH CHECK (
    status = 'confirmed' AND source = 'customer'
  );

-- Bookings: INSERT — authenticated owners can insert for their own turf
CREATE POLICY "insert_bookings_owner" ON bookings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = bookings.turf_id AND turfs.owner_id = auth.uid())
  );

-- Bookings: UPDATE — only authenticated owners, scoped to their turf
CREATE POLICY "update_bookings_owner" ON bookings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = bookings.turf_id AND turfs.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = bookings.turf_id AND turfs.owner_id = auth.uid())
  );

-- Bookings: DELETE — no policies, no one can delete (use status='cancelled')
-- (No DELETE policy = DELETE is denied for all roles)
