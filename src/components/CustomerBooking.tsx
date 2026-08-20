import { Calendar, Clock, MapPin, User, Phone, CheckCircle2, ArrowLeft, Loader2, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { Turf, Ground, Slot, Booking } from '@/lib/types';
import { getLocalDateString, addDaysToLocalDate, formatDate, formatTime, normalizePhone, addHoursToTime, getDurationInHours } from '@/lib/dateUtils';
import {
  getTurfs,
  getTurfWithGrounds,
  getAvailableSlots,
  createBooking,
} from '@/lib/bookingService';

type Step = 'date' | 'slots' | 'details' | 'review' | 'confirmed';

export default function CustomerBooking({ onExit }: { onExit: () => void }) {
  const [turf, setTurf] = useState<Turf | null>(null);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('date');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedGround, setSelectedGround] = useState<Ground | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

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
        setError(e instanceof Error ? e.message : 'Failed to load turf data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todayStr = getLocalDateString();
  const maxDateStr = addDaysToLocalDate(30);

  const loadSlots = useCallback(async () => {
    if (!turf || !selectedGround || !selectedDate) return;
    setError('');
    setSlots([]);
    try {
      const result = await getAvailableSlots(selectedGround.id, turf, selectedDate);
      setSlots(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load slots');
    }
  }, [turf, selectedGround, selectedDate]);

  const handleDateContinue = () => {
    if (!selectedDate) return;
    setStep('slots');
    loadSlots();
  };

  const isSlotAvailableForDuration = (idx: number, duration: number) => {
    if (idx + duration > slots.length) return false;
    for (let k = 0; k < duration; k++) {
      if (!slots[idx + k].available) return false;
    }
    return true;
  };

  const handleSlotSelect = (slot: Slot, idx: number) => {
    if (!isSlotAvailableForDuration(idx, selectedDuration)) return;
    setSelectedSlot({
      start_time: slot.start_time,
      end_time: addHoursToTime(slot.start_time, selectedDuration),
      available: true,
    });
    setStep('details');
  };

  const handleDetailsContinue = () => {
    if (!name.trim() || !phone.trim()) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    setPhone(normalized);
    setError('');
    setStep('review');
  };

  const handleConfirm = async () => {
    if (!turf || !selectedGround || !selectedSlot) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await createBooking({
        ground_id: selectedGround.id,
        turf_id: turf.id,
        booking_date: selectedDate,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        customer_name: name.trim(),
        customer_phone: phone,
        source: 'customer',
      });
      if (result.success && result.booking) {
        setConfirmedBooking(result.booking);
        setStep('confirmed');
      } else {
        setError(result.error ?? 'Booking failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep('date');
    setSelectedDate('');
    setSelectedSlot(null);
    setName('');
    setPhone('');
    setSelectedDuration(1);
    setError('');
    setConfirmedBooking(null);
  };

  const handleBack = () => {
    setError('');
    switch (step) {
      case 'date':
        onExit();
        break;
      case 'slots':
        setStep('date');
        break;
      case 'details':
        setStep('slots');
        break;
      case 'review':
        setStep('details');
        break;
      case 'confirmed':
        reset();
        break;
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
        <p className="text-slate-600">No turf available.</p>
      </div>
    );
  }

  const stepNumber = { date: 1, slots: 2, details: 3, review: 4, confirmed: 5 }[step];
  const stepLabels = ['Date', 'Slot', 'Details', 'Confirm'];

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white" />
          <div className="absolute top-20 -left-10 w-32 h-32 rounded-full bg-white" />
        </div>
        <div className="relative px-6 pt-10 pb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-medium backdrop-blur-sm">
              Book a Slot
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{turf.name}</h1>
          <div className="flex items-center gap-1.5 mt-2 text-emerald-100">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{turf.location}</span>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatTime(turf.opening_time)} – {formatTime(turf.closing_time)}
            </span>
            <span className="font-semibold">₹{turf.price_per_hour}/hr</span>
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      {step !== 'confirmed' && (
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {step === 'date' ? 'Home' : 'Back'}
            </button>
            <button
              onClick={() => {
                reset();
                onExit();
              }}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel booking
            </button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      {step !== 'confirmed' && (
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  n <= stepNumber ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={`text-xs ${i + 1 === stepNumber ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 mt-5">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: DATE */}
        {step === 'date' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Select a date</h2>
            <input
              type="date"
              value={selectedDate}
              min={todayStr}
              max={maxDateStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
            />
            {grounds.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ground</label>
                <select
                  value={selectedGround?.id ?? ''}
                  onChange={(e) => setSelectedGround(grounds.find((g) => g.id === e.target.value) ?? null)}
                  className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {grounds.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={handleDateContinue}
              disabled={!selectedDate}
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              View Available Slots
            </button>
          </div>
        )}

        {/* STEP 2: SLOTS */}
        {step === 'slots' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Available Slots</h2>
            <p className="text-sm text-slate-500">
              {selectedGround?.name} · {formatDate(selectedDate)}
            </p>

            {/* Duration selector */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Duration</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      setSelectedDuration(hours);
                      setSelectedSlot(null); // Reset selected slot when duration changes
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      selectedDuration === hours
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-750 hover:border-slate-300'
                    }`}
                  >
                    {hours} {hours === 1 ? 'Hour' : 'Hours'}
                  </button>
                ))}
              </div>
            </div>

            {slots.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {slots.map((slot, idx) => {
                  const isAvailable = isSlotAvailableForDuration(idx, selectedDuration);
                  return (
                    <button
                      key={slot.start_time}
                      onClick={() => handleSlotSelect(slot, idx)}
                      disabled={!isAvailable}
                      className={`py-3 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                        isAvailable
                          ? 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-600 shadow-sm'
                          : 'bg-slate-100 border border-slate-100 text-slate-300 cursor-not-allowed line-through'
                      }`}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === 'details' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Your Details</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={handleDetailsContinue}
              disabled={!name.trim() || !phone.trim()}
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              Review Booking
            </button>
          </div>
        )}

        {/* STEP 4: REVIEW */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Review & Confirm</h2>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
                <p className="text-sm text-slate-500">Turf</p>
                <p className="font-semibold text-slate-800">{turf.name}</p>
                <p className="text-sm text-slate-500">{turf.location} · {selectedGround?.name}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <ReviewRow icon={<Calendar className="w-4 h-4" />} label="Date" value={formatDate(selectedDate)} />
                <ReviewRow icon={<Clock className="w-4 h-4" />} label="Time" value={`${formatTime(selectedSlot!.start_time)} – ${formatTime(selectedSlot!.end_time)}`} />
                <ReviewRow icon={<Clock className="w-4 h-4" />} label="Duration" value={`${selectedDuration} ${selectedDuration === 1 ? 'hour' : 'hours'}`} />
                <ReviewRow icon={<User className="w-4 h-4" />} label="Name" value={name} />
                <ReviewRow icon={<Phone className="w-4 h-4" />} label="Phone" value={phone} />
                <ReviewRow label="Price" value={`₹${turf.price_per_hour * selectedDuration}`} highlight />
              </div>
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
                <p className="text-sm text-amber-700 font-medium">Payment: Pay at Turf</p>
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Booking'}
            </button>
          </div>
        )}

        {/* STEP 5: CONFIRMED */}
        {step === 'confirmed' && confirmedBooking && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Booking Confirmed!</h2>
              <p className="text-sm text-slate-500 mt-1">Show this at the turf counter</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-emerald-600 text-white">
                <p className="text-xs uppercase tracking-wide text-emerald-100">Booking ID</p>
                <p className="text-lg font-bold font-mono">{confirmedBooking.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <ReviewRow label="Turf" value={turf.name} />
                <ReviewRow label="Date" value={formatDate(confirmedBooking.booking_date)} />
                <ReviewRow label="Time" value={`${formatTime(confirmedBooking.start_time)} – ${formatTime(confirmedBooking.end_time)}`} />
                <ReviewRow label="Duration" value={`${getDurationInHours(confirmedBooking.start_time, confirmedBooking.end_time)} ${getDurationInHours(confirmedBooking.start_time, confirmedBooking.end_time) === 1 ? 'hour' : 'hours'}`} />
                <ReviewRow label="Name" value={confirmedBooking.customer_name ?? '-'} />
                <ReviewRow label="Price" value={`₹${turf.price_per_hour * getDurationInHours(confirmedBooking.start_time, confirmedBooking.end_time)}`} highlight />
                <ReviewRow label="Payment" value="Pay at Turf" />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onExit}
                className="flex-1 py-3.5 rounded-xl bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all active:scale-[0.98]"
              >
                Back to Home
              </button>
              <button
                onClick={reset}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 transition-all active:scale-[0.98]"
              >
                Book Another Slot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-semibold ${highlight ? 'text-emerald-600' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  );
}


