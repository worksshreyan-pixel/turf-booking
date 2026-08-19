/**
 * Date/time utilities for the turf booking system.
 *
 * The application is intended for India. All date calculations use the
 * Asia/Kolkata timezone (IST, UTC+5:30) so that "today" and slot-availability
 * checks are correct regardless of the browser or server's local timezone.
 *
 * Never use toISOString().split('T')[0] for local date calculations — it
 * returns a UTC date which can shift by a day in non-UTC timezones.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current date as a YYYY-MM-DD string in IST.
 */
export function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Returns the current time in minutes since midnight, in IST.
 */
export function getLocalMinutes(date: Date = new Date()): number {
  const istTime = date.toLocaleTimeString('en-GB', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = istTime.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Add days to a date and return the IST YYYY-MM-DD string.
 */
export function addDaysToLocalDate(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/**
 * Format a YYYY-MM-DD date string for display (e.g., "Mon, 18 Aug").
 * Uses IST to avoid UTC date shifts.
 */
export function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIMEZONE,
  });
}

/**
 * Format a HH:MM time string for display (e.g., "6:00 PM").
 */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Normalize an Indian phone number to a 10-digit format.
 *
 * Accepts: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
 * Returns: XXXXXXXXXX (10 digits, no prefix)
 *
 * Returns null if the number cannot be normalized to a valid 10-digit Indian mobile number.
 */
export function normalizePhone(input: string): string | null {
  // Remove all non-digit characters
  let digits = input.replace(/\D/g, '');

  // Strip country code
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Must be exactly 10 digits and start with 6-9 (Indian mobile)
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  return null;
}
