export type BookingStatus = 'confirmed' | 'cancelled' | 'blocked';
export type PaymentStatus = 'pending' | 'paid';
export type BookingSource = 'customer' | 'owner';

export interface Turf {
  id: string;
  name: string;
  location: string;
  price_per_hour: number;
  opening_time: string;
  closing_time: string;
  slot_duration_minutes: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ground {
  id: string;
  turf_id: string;
  name: string;
  created_at: string;
}

export interface Booking {
  id: string;
  ground_id: string;
  turf_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: BookingStatus;
  payment_status: PaymentStatus;
  source: BookingSource;
  created_at: string;
  updated_at: string;
}

export interface TurfWithGrounds extends Turf {
  grounds: Ground[];
}

export interface Slot {
  start_time: string;
  end_time: string;
  available: boolean;
}

export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
}
