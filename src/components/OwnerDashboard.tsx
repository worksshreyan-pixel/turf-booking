import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLocalDateString, formatDate, formatTime, normalizePhone, getLocalMinutes, addHoursToTime, getDurationInHours } from '@/lib/dateUtils';
import {
  TrendingUp,
  Clock,
  User,
  Phone,
  Plus,
  Ban,
  CheckCircle2,
  XCircle,
  Calendar,
  Loader2,
  Wallet,
  Lock,
  Unlock,
  X,
  ArrowLeft,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import type { Turf, Ground, Booking, Slot, BookingStatus, PaymentStatus } from '@/lib/types';
import {
  getTurfs,
  getTurfWithGrounds,
  getBookingsByGround,
  getAvailableSlots,
  generateSlots,
  createManualBooking,
  cancelBooking,
  markPaymentPaid,
  blockSlot,
  unblockSlot,
  calculateStats,
  type DashboardStats,
} from '@/lib/bookingService';
import { supabase } from '@/lib/supabase';

export default function OwnerDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [turf, setTurf] = useState<Turf | null>(null);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [selectedGround, setSelectedGround] = useState<Ground | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalRevenue: 0, pendingPayments: 0, bookedValue: 0, confirmedCount: 0, blockedCount: 0 });

  const [showManualBooking, setShowManualBooking] = useState(false);
  const [showBlockSlot, setShowBlockSlot] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const lastRequestTimestamp = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const allTurfs = await getTurfs();
        if (allTurfs.length === 0) return;
        const firstTurf = allTurfs[0];
        setTurf(firstTurf);
        const twg = await getTurfWithGrounds(firstTurf.id);
        if (twg) {
          setGrounds(twg.grounds);
          if (twg.grounds.length > 0) setSelectedGround(twg.grounds[0]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshData = useCallback(async () => {
    if (!turf || !selectedGround) return;
    const timestamp = Date.now();
    lastRequestTimestamp.current = timestamp;
    try {
      const todayBookings = await getBookingsByGround(selectedGround.id, selectedDate);
      if (timestamp < lastRequestTimestamp.current) {
        return;
      }
      setBookings(todayBookings);
      setStats(calculateStats(todayBookings, turf.price_per_hour, turf.advance_percentage));
      setError('');
    } catch (e) {
      if (timestamp < lastRequestTimestamp.current) return;
      setError(e instanceof Error ? e.message : 'Failed to refresh data');
    }
  }, [turf, selectedGround, selectedDate]);

  useEffect(() => {
    if (turf && selectedGround) refreshData();
  }, [turf, selectedGround, selectedDate, refreshData]);

  // Realtime subscription for automatic dashboard refreshes
  useEffect(() => {
    if (!selectedGround || !selectedDate) return;

    const channel = supabase
      .channel('realtime-bookings-owner-change')
      .on('broadcast', { event: 'booking-updated' }, (payload: any) => {
        const { ground_id, date } = payload.payload;
        if (ground_id === selectedGround.id && date === selectedDate) {
          refreshData();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGround, selectedDate, refreshData]);

  const slots = useMemo(() => {
    if (!turf || !selectedGround) return [];
    const allSlots = generateSlots(turf);
    
    // Include holding (reservations), confirmed, and blocked
    const activeBookings = bookings.filter(
      (b) => b.ground_id === selectedGround.id && (b.status === 'confirmed' || b.status === 'blocked' || b.status === 'holding')
    );

    const todayStr = getLocalDateString();
    const currentMinutes = getLocalMinutes();

    return allSlots.map((slot) => {
      const [h, m] = slot.start_time.split(':').map(Number);
      const slotMinutes = h * 60 + m;

      const isTaken = activeBookings.some((b) => {
        const [startH, startM] = b.start_time.split(':').map(Number);
        const [endH, endM] = b.end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        return slotMinutes >= startMin && slotMinutes < endMin;
      });

      const isPast = selectedDate === todayStr && slotMinutes <= currentMinutes;
      return {
        start_time: slot.start_time,
        end_time: slot.end_time,
        available: !isTaken && !isPast,
      };
    });
  }, [turf, selectedGround, bookings, selectedDate]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleCancel = async (bookingId: string) => {
    setActionLoading(bookingId);
    const result = await cancelBooking(bookingId);
    setActionLoading(null);
    if (result.success) {
      showToast('Booking cancelled');
      refreshData();
    } else {
      setError(result.error ?? 'Failed to cancel');
    }
  };

  const handleMarkPaid = async (bookingId: string) => {
    setActionLoading(bookingId);
    const result = await markPaymentPaid(bookingId);
    setActionLoading(null);
    if (result.success) {
      showToast('Payment marked as paid');
      refreshData();
    } else {
      setError(result.error ?? 'Failed to update payment');
    }
  };

  const handleUnblock = async (bookingId: string) => {
    setActionLoading(bookingId);
    const result = await unblockSlot(bookingId);
    setActionLoading(null);
    if (result.success) {
      showToast('Slot unblocked');
      refreshData();
    } else {
      setError(result.error ?? 'Failed to unblock');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!turf) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6">
        <p className="text-slate-600">No turf configured.</p>
      </div>
    );
  }

  const isToday = selectedDate === getLocalDateString();

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Owner Dashboard</p>
            <h1 className="text-2xl font-bold mt-0.5">{turf.name}</h1>
            <p className="text-sm text-slate-400">{turf.location}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{isToday ? 'Today' : formatDate(selectedDate)}</p>
            <button
              onClick={onSignOut}
              className="flex items-center gap-1 mt-2 text-xs font-semibold text-slate-300 hover:text-red-400 transition-colors ml-auto"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>

        {/* Date / Ground selector */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
          {grounds.length > 0 && (
            <select
              value={selectedGround?.id ?? ''}
              onChange={(e) => setSelectedGround(grounds.find((g) => g.id === e.target.value) ?? null)}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              {grounds.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="px-6 -mt-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} label="Collected Revenue" value={`₹${stats.totalRevenue}`} color="emerald" />
          <StatCard icon={<Wallet className="w-5 h-5 text-amber-600" />} label="Pending Balance" value={`₹${stats.pendingPayments}`} color="amber" />
          <StatCard icon={<Clock className="w-5 h-5 text-blue-600" />} label="Confirmed Slots" value={`${stats.confirmedCount} Booked`} color="blue" />
          <StatCard icon={<Ban className="w-5 h-5 text-slate-650" />} label="Blocked Slots" value={`${stats.blockedCount} Blocked`} color="slate" />
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Manual booking triggers */}
      <div className="px-6 mt-6 flex gap-3">
        <button
          onClick={() => setShowManualBooking(true)}
          className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Manual Booking
        </button>
        <button
          onClick={() => setShowBlockSlot(true)}
          className="flex-1 py-3.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Ban className="w-4 h-4" /> Block Slot
        </button>
      </div>

      {/* Bookings Section */}
      <div className="px-6 mt-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Bookings List
        </h2>
        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center text-slate-500 shadow-sm">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-355" />
            <p className="text-sm font-medium">No bookings on this date</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                pricePerHour={turf.price_per_hour}
                actionLoading={actionLoading}
                onCancel={handleCancel}
                onMarkPaid={handleMarkPaid}
                onUnblock={handleUnblock}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available slots overview */}
      <div className="px-6 mt-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Available Slots — {selectedGround?.name}
        </h2>
        {slots.length === 0 ? (
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {slots.map((slot) => (
              <div
                key={slot.start_time}
                className={`text-center py-2.5 rounded-lg text-xs font-medium ${
                  slot.available
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-100 line-through'
                }`}
              >
                {formatTime(slot.start_time)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showManualBooking && selectedGround && turf && (
        <ManualBookingModal
          ground={selectedGround}
          turf={turf}
          date={selectedDate}
          onClose={() => setShowManualBooking(false)}
          onSuccess={() => {
            showToast('Manual booking created');
            refreshData();
          }}
        />
      )}

      {showBlockSlot && selectedGround && turf && (
        <BlockSlotModal
          ground={selectedGround}
          turf={turf}
          date={selectedDate}
          onClose={() => setShowBlockSlot(false)}
          onSuccess={() => {
            setShowBlockSlot(false);
            showToast('Slot blocked');
            refreshData();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'emerald' | 'amber' | 'blue' | 'slate';
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-650',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking card
// ---------------------------------------------------------------------------

function BookingCard({
  booking,
  pricePerHour,
  actionLoading,
  onCancel,
  onMarkPaid,
  onUnblock,
}: {
  booking: Booking;
  pricePerHour: number;
  actionLoading: string | null;
  onCancel: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onUnblock: (id: string) => void;
}) {
  const isBlocked = booking.status === 'blocked';
  const isCancelled = booking.status === 'cancelled';
  const isHolding = booking.status === 'holding';

  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (booking.status !== 'holding' || !booking.reservation_expires_at) return;
    const expiresAt = new Date(booking.reservation_expires_at).getTime();

    const updateTimer = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    updateTimer();

    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [booking.status, booking.reservation_expires_at]);

  const duration = getDurationInHours(booking.start_time, booking.end_time);
  const total = pricePerHour * duration;
  const advancePercent = 25; // default 25% for breakdown
  const advance = Math.ceil((total * advancePercent) / 100);
  const remaining = total - advance;

  const getPaymentStatusText = () => {
    switch (booking.payment_status) {
      case 'paid':
      case 'fully_paid':
        return 'Fully Paid';
      case 'advance_paid':
        return 'Advance Paid';
      case 'advance_pending':
        return 'Advance Pending';
      case 'pending':
      default:
        return 'Payment Pending';
    }
  };

  const getPaymentStatusStyle = () => {
    switch (booking.payment_status) {
      case 'paid':
      case 'fully_paid':
      case 'advance_paid':
        return 'bg-emerald-50 text-emerald-600 border border-emerald-100';
      case 'advance_pending':
      case 'pending':
      default:
        return 'bg-amber-50 text-amber-600 border border-amber-100';
    }
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isCancelled ? 'border-slate-200 opacity-60' : isBlocked ? 'border-slate-300' : isHolding ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
    }`}>
      <div className="flex items-stretch">
        {/* Time column */}
        <div className={`w-16 flex flex-col items-center justify-center py-4 text-center ${
          isBlocked ? 'bg-slate-200' : isCancelled ? 'bg-slate-100' : isHolding ? 'bg-amber-500 text-white' : 'bg-emerald-650 text-white'
        }`}>
          <span className="text-xs font-bold leading-tight">
            {formatTime(booking.start_time)}
          </span>
          <span className="text-[10px] opacity-75 mt-0.5 leading-none">
            {formatTime(booking.end_time)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-3">
          {isBlocked ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-700 text-sm">Blocked</p>
                <p className="text-xs text-slate-400">Slot unavailable</p>
              </div>
              <button
                onClick={() => onUnblock(booking.id)}
                disabled={actionLoading === booking.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" /> Unblock
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {booking.customer_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {booking.customer_phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">
                    ₹{total}
                  </p>
                  <div className="flex flex-col items-end gap-1 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      booking.source === 'owner' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {booking.source === 'owner' ? 'Owner' : 'Customer'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {duration} {duration === 1 ? 'hour' : 'hours'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial breakdown */}
              {!isCancelled && (booking.payment_status === 'advance_paid' || booking.payment_status === 'advance_pending' || booking.payment_status === 'pending') && (
                <div className="mt-2.5 p-2 bg-slate-50 rounded-xl text-[11px] text-slate-650 space-y-0.5 border border-slate-150">
                  <div className="flex justify-between">
                    <span>Total Price:</span>
                    <span className="font-medium text-slate-850">₹{total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Advance (25%):</span>
                    <span className={`font-semibold ${booking.payment_status === 'advance_paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      ₹{advance} ({booking.payment_status === 'advance_paid' ? 'Paid' : 'Unpaid'})
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-semibold text-slate-800">
                    <span>Remaining Balance:</span>
                    <span>₹{remaining}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isCancelled
                    ? 'bg-red-50 text-red-650 border border-red-100'
                    : isHolding
                    ? 'bg-amber-50 text-amber-655 border border-amber-100 animate-pulse'
                    : 'bg-emerald-50 text-emerald-650 border border-emerald-100'
                }`}>
                  {isCancelled ? 'Cancelled' : isHolding ? `Reserved (${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')})` : 'Confirmed'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPaymentStatusStyle()}`}>
                  {getPaymentStatusText()}
                </span>
              </div>

              {!isCancelled && (
                <div className="flex items-center gap-2 mt-3">
                  {(booking.payment_status === 'pending' || booking.payment_status === 'advance_pending' || booking.payment_status === 'advance_paid') && (
                    <button
                      onClick={() => onMarkPaid(booking.id)}
                      disabled={actionLoading === booking.id || isHolding}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-650 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {actionLoading === booking.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Mark Paid
                    </button>
                  )}
                  <button
                    onClick={() => onCancel(booking.id)}
                    disabled={actionLoading === booking.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-655 text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    {actionLoading === booking.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual booking modal
// ---------------------------------------------------------------------------

function ManualBookingModal({
  ground,
  turf,
  date,
  onClose,
  onSuccess,
}: {
  ground: Ground;
  turf: Turf;
  date: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string>('');

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAvailableSlots(ground.id, turf, date);
      setSlots(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, [ground.id, turf, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const getValidEndTimes = (startTimeStr: string): string[] => {
    if (!startTimeStr || slots.length === 0) return [];
    const startIdx = slots.findIndex((s) => s.start_time === startTimeStr);
    if (startIdx === -1) return [];

    const validEnds: string[] = [];
    for (let idx = startIdx; idx < slots.length; idx++) {
      const slot = slots[idx];
      if (idx === startIdx || slot.available) {
        validEnds.push(slot.end_time);
      } else {
        break;
      }
    }
    return validEnds;
  };

  const handleStartTimeSelect = (timeStr: string) => {
    setSelectedStartTime(timeStr);
    const ends = getValidEndTimes(timeStr);
    if (ends.length > 0) {
      setSelectedEndTime(ends[0]);
    }
  };

  const resetForm = () => {
    setSelectedStartTime('');
    setSelectedEndTime('');
    setName('');
    setPhone('');
    setPaymentStatus('pending');
    setError('');
    setSuccess(false);
    setConfirmedBookingId('');
    loadSlots();
  };

  const handleSubmit = async () => {
    if (!selectedStartTime || !selectedEndTime || !name.trim() || !phone.trim()) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await createManualBooking({
      ground_id: ground.id,
      turf_id: turf.id,
      booking_date: date,
      start_time: selectedStartTime,
      end_time: selectedEndTime,
      customer_name: name.trim(),
      customer_phone: normalized,
      source: 'owner',
      status: 'confirmed',
      payment_status: paymentStatus,
    });
    setSubmitting(false);
    if (result.success && result.booking) {
      setConfirmedBookingId(result.booking.id);
      setSuccess(true);
      onSuccess();
    } else {
      setError(result.error ?? 'Failed to create booking');
    }
  };

  const duration = selectedStartTime && selectedEndTime ? getDurationInHours(selectedStartTime, selectedEndTime) : 0;
  const totalPrice = turf.price_per_hour * duration;
  const validEnds = selectedStartTime ? getValidEndTimes(selectedStartTime) : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      {/* Navigation header */}
      <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-650 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {success ? (
          /* Success state */
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Booking Created!</h2>
              <p className="text-sm text-slate-500 mt-1">Manual booking has been added</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm max-w-md mx-auto">
              <div className="px-5 py-4 bg-emerald-600 text-white">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Booking ID</p>
                <p className="text-lg font-bold font-mono">{confirmedBookingId.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Turf</span>
                  <span className="font-semibold text-slate-800">{turf.name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Ground</span>
                  <span className="font-semibold text-slate-800">{ground.name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Date</span>
                  <span className="font-semibold text-slate-800">{formatDate(date)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Time</span>
                  <span className="font-semibold text-slate-800">
                    {formatTime(selectedStartTime)} – {formatTime(selectedEndTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-semibold text-slate-800">
                    {duration} {duration === 1 ? 'hour' : 'hours'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-semibold text-slate-800">{name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Price</span>
                  <span className="font-semibold text-emerald-600">₹{totalPrice}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-slate-500">Payment</span>
                  <span className="font-semibold text-emerald-600 capitalize">{paymentStatus === 'paid' ? 'Fully Paid' : paymentStatus.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 max-w-md mx-auto">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-xl bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all active:scale-[0.98]"
              >
                Back to Dashboard
              </button>
              <button
                onClick={resetForm}
                className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all active:scale-[0.98]"
              >
                Book Another Slot
              </button>
            </div>
          </div>
        ) : (
          /* Form state */
          <div className="space-y-4 max-w-md mx-auto">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Manual Booking</h2>
              <p className="text-sm text-slate-500 mt-1">{formatDate(date)} · {ground.name}</p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-750 text-sm">{error}</div>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">No available slots for this date.</p>
              </div>
            ) : (
              <>
                {/* Select Start Time */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Start Time</label>
                  {!selectedStartTime ? (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start_time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => handleStartTimeSelect(slot.start_time)}
                          className={`py-2 rounded-lg text-xs font-medium transition-all ${
                            slot.available
                              ? 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-emerald-500'
                              : 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                          }`}
                        >
                          {formatTime(slot.start_time)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                      <span className="text-xs font-bold text-emerald-800">Selected: {formatTime(selectedStartTime)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStartTime('');
                          setSelectedEndTime('');
                        }}
                        className="text-xs text-emerald-600 underline font-semibold"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* Select End Time */}
                {selectedStartTime && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">End Time</label>
                    <div className="grid grid-cols-4 gap-2">
                      {validEnds.map((timeStr) => {
                        const startH = Number(selectedStartTime.split(':')[0]);
                        const endH = Number(timeStr.split(':')[0]);
                        const dur = endH - startH;
                        return (
                          <button
                            key={timeStr}
                            type="button"
                            onClick={() => setSelectedEndTime(timeStr)}
                            className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                              selectedEndTime === timeStr
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {formatTime(timeStr)} ({dur} hr)
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Customer name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Customer Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter name"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Customer phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Payment status selector */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="advance_paid">Advance Paid</option>
                    <option value="paid">Fully Paid</option>
                  </select>
                </div>

                {/* Price & payment summary */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-505">Duration</span>
                    <span className="font-semibold text-slate-800">{duration} Hour{duration > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-505">Total Price</span>
                    <span className="font-semibold text-slate-800">₹{totalPrice}</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!selectedStartTime || !selectedEndTime || !name.trim() || !phone.trim() || submitting}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Booking'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block slot modal
// ---------------------------------------------------------------------------

function BlockSlotModal({
  ground,
  turf,
  date,
  onClose,
  onSuccess,
}: {
  ground: Ground;
  turf: Turf;
  date: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await getAvailableSlots(ground.id, turf, date);
        setSlots(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load slots');
      } finally {
        setLoading(false);
      }
    })();
  }, [ground.id, turf, date]);

  const getValidEndTimes = (startTimeStr: string): string[] => {
    if (!startTimeStr || slots.length === 0) return [];
    const startIdx = slots.findIndex((s) => s.start_time === startTimeStr);
    if (startIdx === -1) return [];

    const validEnds: string[] = [];
    for (let idx = startIdx; idx < slots.length; idx++) {
      const slot = slots[idx];
      if (idx === startIdx || slot.available) {
        validEnds.push(slot.end_time);
      } else {
        break;
      }
    }
    return validEnds;
  };

  const handleStartTimeSelect = (timeStr: string) => {
    setSelectedStartTime(timeStr);
    const ends = getValidEndTimes(timeStr);
    if (ends.length > 0) {
      setSelectedEndTime(ends[0]);
    }
  };

  const handleBlock = async () => {
    if (!selectedStartTime || !selectedEndTime) return;
    setSubmitting(true);
    setError('');
    const result = await blockSlot(ground.id, turf.id, date, selectedStartTime, selectedEndTime);
    setSubmitting(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error ?? 'Failed to block slot');
    }
  };

  const duration = selectedStartTime && selectedEndTime ? getDurationInHours(selectedStartTime, selectedEndTime) : 0;
  const validEnds = selectedStartTime ? getValidEndTimes(selectedStartTime) : [];

  return (
    <Modal title="Block Slot Range" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{formatDate(date)} · {ground.name}</p>
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-205 text-red-750 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No available slots to block.</p>
        ) : (
          <>
            {/* Start Time Select */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Start Time</label>
              {!selectedStartTime ? (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.start_time}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => handleStartTimeSelect(slot.start_time)}
                      className={`py-2 rounded-lg text-xs font-medium transition-all ${
                        slot.available
                          ? 'bg-slate-50 text-slate-650 border border-slate-205 hover:border-slate-450'
                          : 'bg-slate-100 text-slate-350 cursor-not-allowed line-through'
                      }`}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 bg-slate-100 rounded-lg">
                  <span className="text-xs font-bold text-slate-800">Selected: {formatTime(selectedStartTime)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStartTime('');
                      setSelectedEndTime('');
                    }}
                    className="text-xs text-slate-505 underline font-semibold"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* End Time Select */}
            {selectedStartTime && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">End Time</label>
                <div className="grid grid-cols-4 gap-2">
                  {validEnds.map((timeStr) => {
                    const startH = Number(selectedStartTime.split(':')[0]);
                    const endH = Number(timeStr.split(':')[0]);
                    const dur = endH - startH;
                    return (
                      <button
                        key={timeStr}
                        type="button"
                        onClick={() => setSelectedEndTime(timeStr)}
                        className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                          selectedEndTime === timeStr
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-705 hover:border-slate-300'
                        }`}
                      >
                        {formatTime(timeStr)} ({dur} hr)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handleBlock}
              disabled={!selectedStartTime || !selectedEndTime || submitting}
              className="w-full py-3.5 rounded-xl bg-slate-850 text-white font-semibold hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Ban className="w-4 h-4" /> Block Slots ({duration} hr{duration > 1 ? 's' : ''})</>}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper (used for Block Slot only)
// ---------------------------------------------------------------------------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
