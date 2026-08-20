-- Enable btree_gist extension (required for uuid and timestamp range exclusion index)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop the old simple unique index
DROP INDEX IF EXISTS uniq_active_booking_per_slot;

-- Add the exclusion constraint for overlapping active bookings on the same ground
ALTER TABLE bookings
ADD CONSTRAINT bookings_overlap_exclusion
EXCLUDE USING gist (
  ground_id WITH =,
  tsrange(
    (booking_date + start_time),
    (booking_date + end_time)
  ) WITH &&
)
WHERE (status IN ('confirmed', 'blocked'));
