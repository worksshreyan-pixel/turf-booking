import { supabase } from './supabase';
import { getLocalDateString, getLocalMinutes, normalizePhone } from './dateUtils';
import type {
  Turf,
  Ground,
  Booking,
  Slot,
  BookingResult,
  TurfWithGrounds,
} from './types';

// ---------------------------------------------------------------------------
// Turf & Ground queries
// ---------------------------------------------------------------------------

export async function getTurfs(): Promise<Turf[]> {
  const { data, error } = await supabase
    .from('turfs')
    .select('*')
    .order('created_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTurfById(id: string): Promise<Turf | null> {
  const { data, error } = await supabase
    .from('turfs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getGroundsByTurf(turfId: string): Promise<Ground[]> {
  const { data, error } = await supabase
    .from('grounds')
    .select('*')
    .eq('turf_id', turfId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTurfWithGrounds(turfId: string): Promise<TurfWithGrounds | null> {
  const turf = await getTurfById(turfId);
  if (!turf) return null;
  const grounds = await getGroundsByTurf(turfId);
  return { ...turf, grounds };
}

// ---------------------------------------------------------------------------
// Slot generation & availability
// ---------------------------------------------------------------------------

/**
 * Generate all possible time slots for a turf based on its opening/closing
 * time and slot duration. Does NOT check bookings — use getAvailableSlots()
 * for that.
 */
export function generateSlots(turf: Turf): { start_time: string; end_time: string }[] {
  const slots: { start_time: string; end_time: string }[] = [];
  const duration = turf.slot_duration_minutes;

  const [openH, openM] = turf.opening_time.split(':').map(Number);
  const [closeH, closeM] = turf.closing_time.split(':').map(Number);

  let current = openH * 60 + openM;
  const close = closeH * 60 + closeM;

  while (current + duration <= close) {
    const startH = Math.floor(current / 60);
    const startM = current % 60;
    const endMin = current + duration;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;

    slots.push({
      start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
      end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
    });
    current += duration;
  }
  return slots;
}

/**
 * Get all active (non-cancelled) bookings for a ground on a given date.
 */
export async function getBookingsForDate(
  groundId: string,
  date: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('ground_id', groundId)
    .eq('booking_date', date)
    .in('status', ['confirmed', 'blocked'])
    .order('start_time');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Get all bookings for a turf on a given date (across all grounds).
 * Includes cancelled bookings for history.
 */
export async function getBookingsForTurf(
  turfId: string,
  date: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('turf_id', turfId)
    .eq('booking_date', date)
    .order('start_time');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Unified booking query function. All booking reads should go through this.
 * Scoped by turf_id to support multi-turf.
 */
export async function getBookings(
  turfId: string,
  date: string,
  options?: { activeOnly?: boolean }
): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('*')
    .eq('turf_id', turfId)
    .eq('booking_date', date)
    .order('start_time');

  if (options?.activeOnly) {
    query = query.in('status', ['confirmed', 'blocked']);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Check whether a specific slot is available for booking.
 * This is a pre-check only — the database unique index is the final authority.
 */
export async function checkAvailability(
  groundId: string,
  date: string,
  startTime: string
): Promise<boolean> {
  const bookings = await getBookingsForDate(groundId, date);
  return !bookings.some((b) => b.start_time === startTime);
}

/**
 * Get all available time slots for a ground on a given date.
 * Returns slots with an `available` flag — false if already booked, blocked, or past.
 * Uses IST for "today" and current-time checks.
 */
export async function getAvailableSlots(
  groundId: string,
  turf: Turf,
  date: string
): Promise<Slot[]> {
  const allSlots = generateSlots(turf);
  const bookings = await getBookingsForDate(groundId, date);

  const takenStarts = new Set(bookings.map((b) => b.start_time));

  const todayStr = getLocalDateString();
  const currentMinutes = getLocalMinutes();

  return allSlots.map((slot) => {
    const [h, m] = slot.start_time.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const isPast = date === todayStr && slotMinutes <= currentMinutes;
    return {
      start_time: slot.start_time,
      end_time: slot.end_time,
      available: !takenStarts.has(slot.start_time) && !isPast,
    };
  });
}

// ---------------------------------------------------------------------------
// Booking mutations
// ---------------------------------------------------------------------------

interface CreateBookingParams {
  ground_id: string;
  turf_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  customer_phone: string;
  source?: 'customer' | 'owner';
}

/**
 * Create a new booking. Checks availability first, then inserts.
 * The unique partial index on (ground_id, booking_date, start_time) WHERE
 * status IN ('confirmed','blocked') is the final concurrency guard.
 *
 * Phone numbers are normalized to 10-digit Indian format before storage.
 */
export async function createBooking(
  params: CreateBookingParams
): Promise<BookingResult> {
  // Normalize phone
  const normalizedPhone = normalizePhone(params.customer_phone);
  if (!normalizedPhone) {
    return { success: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
  }

  const available = await checkAvailability(
    params.ground_id,
    params.booking_date,
    params.start_time
  );
  if (!available) {
    return { success: false, error: 'This slot is no longer available. Please pick another time.' };
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      ground_id: params.ground_id,
      turf_id: params.turf_id,
      booking_date: params.booking_date,
      start_time: params.start_time,
      end_time: params.end_time,
      customer_name: params.customer_name.trim(),
      customer_phone: normalizedPhone,
      status: 'confirmed',
      payment_status: 'pending',
      source: params.source ?? 'customer',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This slot was just booked by someone else. Please pick another time.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true, booking: data };
}

/**
 * Create a manual booking from the owner dashboard. Same system as customer
 * bookings, just tagged source='owner'.
 */
export async function createManualBooking(
  params: CreateBookingParams
): Promise<BookingResult> {
  return createBooking({ ...params, source: 'owner' });
}

/**
 * Cancel a booking (soft delete — sets status to 'cancelled').
 * Only active bookings (confirmed or blocked) can be cancelled.
 * Cancelled bookings remain in the database for history.
 */
export async function cancelBooking(bookingId: string): Promise<BookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .in('status', ['confirmed', 'blocked'])
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Booking not found or already cancelled.' };
  return { success: true, booking: data };
}

/**
 * Mark a confirmed booking's payment as paid.
 * Cannot mark blocked or cancelled bookings as paid.
 */
export async function markPaymentPaid(bookingId: string): Promise<BookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ payment_status: 'paid' })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Booking not found or not a confirmed booking.' };
  return { success: true, booking: data };
}

/**
 * Block a slot so it cannot be booked. Creates a booking with status='blocked',
 * no customer info.
 */
export async function blockSlot(
  groundId: string,
  turfId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<BookingResult> {
  const available = await checkAvailability(groundId, date, startTime);
  if (!available) {
    return { success: false, error: 'This slot is already booked or blocked.' };
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      ground_id: groundId,
      turf_id: turfId,
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      customer_name: null,
      customer_phone: null,
      status: 'blocked',
      payment_status: 'pending',
      source: 'owner',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This slot is already booked or blocked.' };
    }
    return { success: false, error: error.message };
  }
  return { success: true, booking: data };
}

/**
 * Unblock a previously blocked slot (cancel the blocked booking).
 */
export async function unblockSlot(bookingId: string): Promise<BookingResult> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('status', 'blocked')
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Blocked slot not found.' };
  return { success: true, booking: data };
}

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

export async function getTodayBookings(turfId: string): Promise<Booking[]> {
  const today = getLocalDateString();
  return getBookings(turfId, today);
}

export async function getBookingsByDate(
  turfId: string,
  date: string
): Promise<Booking[]> {
  return getBookings(turfId, date);
}

export interface DashboardStats {
  /** Collected revenue: only paid confirmed bookings */
  totalRevenue: number;
  /** Pending payments: only pending confirmed bookings */
  pendingPayments: number;
  /** Total booked value: all confirmed bookings regardless of payment status */
  bookedValue: number;
  confirmedCount: number;
  blockedCount: number;
}

/**
 * Calculate dashboard stats from a list of bookings.
 *
 * - totalRevenue: only confirmed + paid bookings count as collected revenue
 * - pendingPayments: only confirmed + pending bookings
 * - bookedValue: all confirmed bookings regardless of payment status
 * - cancelled and blocked bookings never count toward revenue
 */
export function calculateStats(bookings: Booking[], pricePerHour: number): DashboardStats {
  const active = bookings.filter((b) => b.status === 'confirmed');
  const blocked = bookings.filter((b) => b.status === 'blocked');
  const paid = active.filter((b) => b.payment_status === 'paid');
  const pending = active.filter((b) => b.payment_status === 'pending');

  return {
    totalRevenue: paid.length * pricePerHour,
    pendingPayments: pending.length * pricePerHour,
    bookedValue: active.length * pricePerHour,
    confirmedCount: active.length,
    blockedCount: blocked.length,
  };
}
