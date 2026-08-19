/*
# Fix grounds SELECT policy for owner isolation

## Purpose
The grounds SELECT policy currently allows authenticated owners to see ALL grounds
across all turfs via `USING (true)`. This breaks owner-to-turf isolation — an owner
should only see grounds belonging to their own turf(s).

## Fix
- Drop the combined `select_grounds_public` policy
- Create two separate SELECT policies:
  - `select_grounds_anon`: anon can read all grounds (customers need this for booking)
  - `select_grounds_owner`: authenticated owners can only read grounds for their own turf(s)
*/

DROP POLICY IF EXISTS "select_grounds_public" ON grounds;

CREATE POLICY "select_grounds_anon" ON grounds FOR SELECT
  TO anon USING (true);

CREATE POLICY "select_grounds_owner" ON grounds FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM turfs WHERE turfs.id = grounds.turf_id AND turfs.owner_id = auth.uid())
  );
