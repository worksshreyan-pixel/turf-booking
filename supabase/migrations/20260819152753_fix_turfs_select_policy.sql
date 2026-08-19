/*
# Fix turfs SELECT policy for owner isolation

## Purpose
The previous migration allowed authenticated users to read ALL turfs via `USING (true)`.
This fixes it so authenticated owners only see their own turfs, while anon users
(customers) can still see all turfs for booking purposes.

## Changes
- Drop the combined `select_turfs_public` policy
- Create two separate SELECT policies:
  - `select_turfs_anon`: anon can read all turfs (customers need to see turfs to book)
  - `select_turfs_owner`: authenticated owners can only read their own turfs
*/

DROP POLICY IF EXISTS "select_turfs_public" ON turfs;

CREATE POLICY "select_turfs_anon" ON turfs FOR SELECT
  TO anon USING (true);

CREATE POLICY "select_turfs_owner" ON turfs FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);
