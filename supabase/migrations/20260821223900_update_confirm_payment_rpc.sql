CREATE OR REPLACE FUNCTION confirm_booking_payment(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_expired boolean;
  v_ground_id uuid;
  v_booking_date date;
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

  -- Get ground_id and booking_date
  SELECT ground_id, booking_date INTO v_ground_id, v_booking_date
  FROM bookings
  WHERE id = p_booking_id;

  -- Confirm booking
  UPDATE bookings
  SET status = 'confirmed',
      payment_status = 'advance_paid'
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true, 
    'ground_id', v_ground_id, 
    'booking_date', v_booking_date
  );
END;
$$;
