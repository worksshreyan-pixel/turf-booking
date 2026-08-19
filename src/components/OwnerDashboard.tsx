import { useState, useEffect, useCallback } from 'react';
import { getLocalDateString, formatDate, formatTime, normalizePhone } from '@/lib/dateUtils';
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
} from 'lucide-react';
import type { Turf, Ground, Booking, Slot } from '@/lib/types';
import {
  getTurfs,
  getTurfWithGrounds,
  getBookingsByDate,
  getAvailableSlots,
  createManualBooking,
  cancelBooking,
  markPaymentPaid,
  blockSlot,
  unblockSlot,
  calculateStats,
  type DashboardStats,
} from '@/lib/bookingService';

export default function OwnerDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [turf, setTurf] = useState<Turf | null>(null);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [selectedGround, setSelectedGround] = useState<Ground | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalRevenue: 0, pendingPayments: 0, bookedValue: 0, confirmedCount: 0, blockedCount: 0 });
  const [slots, setSlots] = useState<Slot[]>([]);

  const [showManualBooking, setShowManualBooking] = useState(false);
  const [showBlockSlot, setShowBlockSlot] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

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
    try {
      const [todayBookings, availSlots] = await Promise.all([
        getBookingsByDate(turf.id, selectedDate),
        getAvailableSlots(selectedGround.id, turf, selectedDate),
      ]);
      setBookings(todayBookings);
      setSlots(availSlots);
      setStats(calculateStats(todayBookings, turf.price_per_hour));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh data');
    }
  }, [turf, selectedGround, selectedDate]);

  useEffect(() => {
    if (turf && selectedGround) refreshData();
  }, [turf, selectedGround, selectedDate, refreshData]);

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
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 bg-slate-800 text-white text-sm rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={onSignOut}
              className="mt-2 flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-red-900 hover:text-red-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="px-6 -mt-3">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Wallet className="w-5 h-5" />}
            label="Total Revenue"
            value={`₹${stats.totalRevenue}`}
            color="emerald"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Pending Payments"
            value={`₹${stats.pendingPayments}`}
            color="amber"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Booked Value"
            value={`₹${stats.bookedValue}`}
            color="blue"
          />
          <StatCard
            icon={<Lock className="w-5 h-5" />}
            label="Blocked Slots"
            value={String(stats.blockedCount)}
            color="slate"
          />
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="float-right">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 mt-5 flex gap-3">
        <button
          onClick={() => setShowManualBooking(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Manual Booking
        </button>
        <button
          onClick={() => setShowBlockSlot(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-white font-semibold shadow-sm hover:bg-slate-900 transition-all active:scale-[0.98]"
        >
          <Ban className="w-4 h-4" /> Block Slot
        </button>
      </div>

      {/* Ground selector if multiple */}
      {grounds.length > 1 && (
        <div className="px-6 mt-4">
          <select
            value={selectedGround?.id ?? ''}
            onChange={(e) => setSelectedGround(grounds.find((g) => g.id === e.target.value) ?? null)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {grounds.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Bookings list */}
      <div className="px-6 mt-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {isToday ? "Today's Bookings" : 'Bookings'}
        </h2>
        {bookings.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No bookings for this date</p>
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

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isCancelled ? 'border-slate-200 opacity-60' : isBlocked ? 'border-slate-300' : 'border-slate-200'
    }`}>
      <div className="flex items-stretch">
        {/* Time column */}
        <div className={`w-16 flex flex-col items-center justify-center py-4 ${
          isBlocked ? 'bg-slate-200' : isCancelled ? 'bg-slate-100' : 'bg-emerald-600'
        }`}>
          <span className={`text-sm font-bold ${isBlocked || isCancelled ? 'text-slate-600' : 'text-white'}`}>
            {formatTime(booking.start_time)}
          </span>
          <span className={`text-xs ${isBlocked || isCancelled ? 'text-slate-400' : 'text-emerald-100'}`}>
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
                  <p className="text-sm font-semibold text-slate-700">₹{pricePerHour}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    booking.source === 'owner' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {booking.source === 'owner' ? 'Owner' : 'Customer'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  isCancelled
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {isCancelled ? 'Cancelled' : 'Confirmed'}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  booking.payment_status === 'paid'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}>
                  {booking.payment_status === 'paid' ? 'Paid' : 'Payment Pending'}
                </span>
              </div>

              {!isCancelled && (
                <div className="flex items-center gap-2 mt-3">
                  {booking.payment_status === 'pending' && (
                    <button
                      onClick={() => onMarkPaid(booking.id)}
                      disabled={actionLoading === booking.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors"
                    >
                      {actionLoading === booking.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Mark Paid
                    </button>
                  )}
                  <button
                    onClick={() => onCancel(booking.id)}
                    disabled={actionLoading === booking.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
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
    slate: 'bg-slate-100 text-slate-600',
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
// Manual booking modal — full screen with Back to Dashboard + success state
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
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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
      setSlots(result.filter((s) => s.available));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, [ground.id, turf, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const resetForm = () => {
    setSelectedSlot(null);
    setName('');
    setPhone('');
    setError('');
    setSuccess(false);
    setConfirmedBookingId('');
    loadSlots();
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !name.trim() || !phone.trim()) return;
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
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
      customer_name: name.trim(),
      customer_phone: normalized,
      source: 'owner',
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      {/* Navigation header */}
      <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
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
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-emerald-600 text-white">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Booking ID</p>
                <p className="text-lg font-bold font-mono">{confirmedBookingId.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Turf</span>
                  <span className="text-sm font-semibold text-slate-800">{turf.name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Ground</span>
                  <span className="text-sm font-semibold text-slate-800">{ground.name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Date</span>
                  <span className="text-sm font-semibold text-slate-800">{formatDate(date)}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Time</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {selectedSlot ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Customer</span>
                  <span className="text-sm font-semibold text-slate-800">{name}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Price</span>
                  <span className="text-sm font-semibold text-emerald-600">₹{turf.price_per_hour}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-500">Payment</span>
                  <span className="text-sm font-semibold text-amber-600">Pending</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
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
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">No available slots for this date.</p>
                <p className="text-xs text-slate-400 mt-1">All slots are booked or blocked.</p>
              </div>
            ) : (
              <>
                {/* Date display */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                  <div className="px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm">
                    {formatDate(date)}
                  </div>
                </div>

                {/* Slot selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Available Slot</label>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.start_time}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-2.5 rounded-lg text-xs font-medium transition-all ${
                          selectedSlot?.start_time === slot.start_time
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-emerald-400'
                        }`}
                      >
                        {formatTime(slot.start_time)}
                      </button>
                    ))}
                  </div>
                </div>

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

                {/* Price & payment summary */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Price</span>
                    <span className="text-sm font-semibold text-slate-800">₹{turf.price_per_hour}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Payment Status</span>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-600">Pending</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!selectedSlot || !name.trim() || !phone.trim() || submitting}
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
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const result = await getAvailableSlots(ground.id, turf, date);
        setSlots(result.filter((s) => s.available));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load slots');
      } finally {
        setLoading(false);
      }
    })();
  }, [ground.id, turf, date]);

  const handleBlock = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError('');
    const result = await blockSlot(ground.id, turf.id, date, selectedSlot.start_time, selectedSlot.end_time);
    setSubmitting(false);
    if (result.success) {
      onSuccess();
    } else {
      setError(result.error ?? 'Failed to block slot');
    }
  };

  return (
    <Modal title="Block a Slot" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{formatDate(date)} · {ground.name}</p>
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No available slots to block.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start_time}
                  onClick={() => setSelectedSlot(slot)}
                  className={`py-2.5 rounded-lg text-xs font-medium transition-all ${
                    selectedSlot?.start_time === slot.start_time
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {formatTime(slot.start_time)}
                </button>
              ))}
            </div>
            <button
              onClick={handleBlock}
              disabled={!selectedSlot || submitting}
              className="w-full py-3.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Ban className="w-4 h-4" /> Block Slot</>}
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


