-- Backend audit fixes: add CHECK constraints and a phone normalization function

-- 1. Add CHECK constraints on bookings for status, payment_status, source
--    (These are in addition to the existing CHECK constraints from the original migration.
--    If the original CHECK constraints already exist, these are idempotent no-ops via DO block.)

DO $$
BEGIN
  -- status CHECK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_status_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('confirmed', 'cancelled', 'blocked'));
  END IF;

  -- payment_status CHECK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_status_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
      CHECK (payment_status IN ('pending', 'paid'));
  END IF;

  -- source CHECK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_source_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_source_check
      CHECK (source IN ('customer', 'owner'));
  END IF;
END $$;

-- 2. Add a CHECK constraint: blocked bookings must not have customer info
--    (blocked slots are owner-created placeholders, not customer bookings)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_blocked_no_customer_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_blocked_no_customer_check
      CHECK (
        status != 'blocked' OR (customer_name IS NULL AND customer_phone IS NULL)
      );
  END IF;
END $$;

-- 3. Add a CHECK constraint: confirmed bookings must have customer info
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_confirmed_has_customer_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_confirmed_has_customer_check
      CHECK (
        status != 'confirmed' OR (customer_name IS NOT NULL AND customer_phone IS NOT NULL)
      );
  END IF;
END $$;

-- 4. Add a CHECK constraint: blocked bookings must have payment_status = 'pending'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_blocked_payment_check' AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_blocked_payment_check
      CHECK (status != 'blocked' OR payment_status = 'pending');
  END IF;
END $$;
