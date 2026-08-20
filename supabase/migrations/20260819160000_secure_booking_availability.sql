-- 1. Remove the anonymous SELECT policy on bookings
DROP POLICY IF EXISTS "select_bookings_anon_active" ON bookings;

-- 2. Create the SECURITY DEFINER function to check slot availability
CREATE OR REPLACE FUNCTION get_active_slots(p_ground_id uuid, p_date date)
RETURNS TABLE (start_time time, end_time time)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT b.start_time, b.end_time
  FROM bookings b
  WHERE b.ground_id = p_ground_id
    AND b.booking_date = p_date
    AND b.status IN ('confirmed', 'blocked');
END;
$$;

-- 3. Grant execute privileges on the function to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_active_slots(uuid, date) TO anon, authenticated;
