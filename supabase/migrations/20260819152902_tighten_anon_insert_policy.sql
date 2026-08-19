/*
# Tighten anon booking INSERT policy

## Purpose
The anon INSERT policy on bookings only checked status='confirmed' and source='customer',
but did not restrict payment_status. An anonymous customer could insert a booking with
payment_status='paid', bypassing the owner's payment collection.

## Fix
Drop and recreate the anon INSERT policy to also require payment_status='pending'.
Also clean up the test booking from TEST H.
*/

DROP POLICY IF EXISTS "insert_bookings_anon_customer" ON bookings;

CREATE POLICY "insert_bookings_anon_customer" ON bookings FOR INSERT
  TO anon WITH CHECK (
    status = 'confirmed' AND source = 'customer' AND payment_status = 'pending'
  );

-- Clean up test data
DELETE FROM bookings WHERE customer_name LIKE 'Test%';
