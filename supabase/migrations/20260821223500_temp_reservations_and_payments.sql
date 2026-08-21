-- 1. Enable btree_gist extension (should already be enabled, but keep for safety)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

-- 3. Add columns to turfs
ALTER TABLE turfs ADD COLUMN IF NOT EXISTS advance_percentage integer DEFAULT 25 CHECK (advance_percentage >= 0 AND advance_percentage <= 100);

-- 4. Update status check constraint on bookings
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'blocked'::text, 'holding'::text]));

-- 5. Update payment status check constraint on bookings
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'advance_pending'::text, 'advance_paid'::text, 'fully_paid'::text]));

-- 6. Update overlap exclusion constraint on bookings to protect active holding reservations
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_overlap_exclusion;
ALTER TABLE bookings ADD CONSTRAINT bookings_overlap_exclusion
EXCLUDE USING gist (
  ground_id WITH =,
  tsrange(
    (booking_date + start_time),
    (booking_date + end_time)
  ) WITH &&
)
WHERE (status IN ('confirmed', 'blocked', 'holding'));

-- 7. Update anonymous customer insert policy
DROP POLICY IF EXISTS "insert_bookings_anon_customer" ON bookings;
CREATE POLICY "insert_bookings_anon_customer" ON bookings FOR INSERT
  TO anon WITH CHECK (
    status = 'holding' AND source = 'customer' AND payment_status = 'advance_pending'
  );

-- 8. Create trigger function to clean up expired reservations BEFORE INSERT
CREATE OR REPLACE FUNCTION clean_expired_reservations()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM bookings
  WHERE status = 'holding'
    AND reservation_expires_at <= now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clean_expired_reservations ON bookings;
CREATE TRIGGER trg_clean_expired_reservations
BEFORE INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION clean_expired_reservations();

-- 9. Update get_active_slots RPC to delete expired reservations and return unexpired holding slots
CREATE OR REPLACE FUNCTION get_active_slots(p_ground_id uuid, p_date date)
RETURNS TABLE (start_time time, end_time time)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First, delete expired reservations
  DELETE FROM bookings
  WHERE status = 'holding'
    AND reservation_expires_at <= now();

  RETURN QUERY
  SELECT b.start_time, b.end_time
  FROM bookings b
  WHERE b.ground_id = p_ground_id
    AND b.booking_date = p_date
    AND (
      b.status IN ('confirmed', 'blocked')
      OR (b.status = 'holding' AND b.reservation_expires_at > now())
    );
END;
$$;

-- 10. Create confirm_booking_payment RPC function
CREATE OR REPLACE FUNCTION confirm_booking_payment(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_expired boolean;
BEGIN
  -- Check if booking exists and is currently 'holding'
  SELECT EXISTS (
    SELECT 1 FROM bookings 
    WHERE id = p_booking_id AND status = 'holding'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN json_build_object('success', false, 'error', 'Reservation not found or already processed.');
  END IF;

  -- Check if expired
  SELECT EXISTS (
    SELECT 1 FROM bookings 
    WHERE id = p_booking_id 
      AND status = 'holding' 
      AND reservation_expires_at <= now()
  ) INTO v_expired;

  IF v_expired THEN
    -- Change status to cancelled
    UPDATE bookings 
    SET status = 'cancelled' 
    WHERE id = p_booking_id;
    
    RETURN json_build_object('success', false, 'error', 'Reservation has expired.');
  END IF;

  -- Confirm booking
  UPDATE bookings
  SET status = 'confirmed',
      payment_status = 'advance_paid'
  WHERE id = p_booking_id;

  RETURN json_build_object('success', true);
END;
$$;
