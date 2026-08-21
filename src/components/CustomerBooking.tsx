import { Calendar, Clock, MapPin, User, Phone, CheckCircle2, ArrowLeft, Loader2, X, AlertCircle } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Turf, Ground, Slot, Booking } from '@/lib/types';
import { getLocalDateString, addDaysToLocalDate, formatDate, formatTime, normalizePhone, addHoursToTime, getDurationInHours } from '@/lib/dateUtils';
import {
  getTurfs,
  getTurfWithGrounds,
  getAvailableSlots,
  createBooking,
  confirmBookingPayment,
} from '@/lib/bookingService';
import { supabase } from '@/lib/supabase';

type Step = 'date' | 'slots' | 'details' | 'review' | 'payment' | 'confirmed';

export default function CustomerBooking({ onExit }: { onExit: () => void }) {
  const [turf, setTurf] = useState<Turf | null>(null);
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('date');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedGround, setSelectedGround] = useState<Ground | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  
  // Reservation states
  const [reservationBooking, setReservationBooking] = useState<Booking | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Realtime subscription to reload slots on external changes
  useEffect(() => {
    if (!selectedGround || !selectedDate || step === 'confirmed') return;

    const channel = supabase
      .channel('realtime-bookings-change')
      .on('broadcast', { event: 'booking-updated' }, (payload: any) => {
        const { ground_id, date } = payload.payload;
        if (ground_id === selectedGround.id && date === selectedDate) {
          loadSlots();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedGround, selectedDate, loadSlots, step]);

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

  const handleStartTimeSelect = (startTimeStr: string) => {
    setSelectedStartTime(startTimeStr);
    const ends = getValidEndTimes(startTimeStr);
    if (ends.length > 0) {
      setSelectedEndTime(ends[0]); // Default 1 hour
    }
  };

  const handleSlotsContinue = () => {
    if (!selectedStartTime || !selectedEndTime) return;
    setSelectedSlot({
      start_time: selectedStartTime,
      end_time: selectedEndTime,
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

  // Create temporary reservation
  const handleReserve = async () => {
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
        status: 'holding',
        payment_status: 'advance_pending',
      });
      if (result.success && result.booking) {
        setReservationBooking(result.booking);
        setStep('payment');
        setSecondsLeft(300); // 5 minutes countdown
      } else {
        setError(result.error ?? 'Reservation failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reservation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Timer countdown hook for temporary reservation
  useEffect(() => {
    if (step !== 'payment' || !reservationBooking) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const expiresAt = new Date(reservationBooking.reservation_expires_at!).getTime();

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);

      if (left === 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        // Clean up locally
        setError('Your 5-minute reservation has expired and the slots have been released.');
        setReservationBooking(null);
        setSelectedSlot(null);
        setSelectedStartTime('');
        setSelectedEndTime('');
        setStep('slots');
        loadSlots();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, reservationBooking, loadSlots]);

  const handleSimulatePaymentSuccess = async () => {
    if (!reservationBooking) return;
    setSubmitting(true);
    setPaymentError('');
    try {
      const res = await confirmBookingPayment(reservationBooking.id);
      if (res.success) {
        if (timerRef.current) clearInterval(timerRef.current);
        const confirmed: Booking = {
          ...reservationBooking,
          status: 'confirmed',
          payment_status: 'advance_paid',
        };
        setConfirmedBooking(confirmed);
        setStep('confirmed');
      } else {
        setPaymentError(res.error ?? 'Payment confirmation failed.');
      }
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Payment confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulatePaymentFailure = () => {
    setPaymentError('Simulated transaction failed. Please try again.');
  };

  const reset = () => {
    setStep('date');
    setSelectedDate('');
    setSelectedStartTime('');
    setSelectedEndTime('');
    setSelectedSlot(null);
    setName('');
    setPhone('');
    setError('');
    setPaymentError('');
    setReservationBooking(null);
    setConfirmedBooking(null);
  };

  const handleBack = () => {
    setError('');
    setPaymentError('');
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
      case 'payment':
        // Cancel holding reservation manually if back is pressed
        if (reservationBooking) {
          (async () => {
            try {
              const { error: cancelErr } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', reservationBooking.id);
              if (!cancelErr) {
                const channel = supabase.channel('realtime-bookings');
                await channel.send({
                  type: 'broadcast',
                  event: 'booking-updated',
                  payload: { ground_id: selectedGround!.id, date: selectedDate },
                });
              }
            } catch (e) {
              console.error(e);
            }
          })();
        }
        setReservationBooking(null);
        setStep('review');
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

  const stepNumber = { date: 1, slots: 2, details: 3, review: 4, payment: 4, confirmed: 5 }[step];
  const stepLabels = ['Date', 'Slot', 'Details', 'Confirm'];

  // Financial math variables
  const duration = selectedSlot ? getDurationInHours(selectedSlot.start_time, selectedSlot.end_time) : 0;
  const totalPrice = turf.price_per_hour * duration;
  const advancePercent = turf.advance_percentage ?? 25;
  const advanceRequired = Math.ceil((totalPrice * advancePercent) / 100);
  const remainingPrice = totalPrice - advanceRequired;

  const validEnds = selectedStartTime ? getValidEndTimes(selectedStartTime) : [];

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
                if (reservationBooking) {
                  // Cancel reservation on exit
                  supabase.from('bookings').update({ status: 'cancelled' }).eq('id', reservationBooking.id);
                }
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
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
            <span>{error}</span>
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
            <h2 className="text-lg font-semibold text-slate-800">Select Booking Range</h2>
            <p className="text-sm text-slate-500">
              {selectedGround?.name} · {formatDate(selectedDate)}
            </p>

            {slots.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Start Time Select Panel */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Start Time</label>
                  {!selectedStartTime ? (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start_time}
                          type="button"
                          onClick={() => handleStartTimeSelect(slot.start_time)}
                          disabled={!slot.available}
                          className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                            slot.available
                              ? 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-600 shadow-sm'
                              : 'bg-slate-100 border-slate-100 text-slate-300 cursor-not-allowed line-through'
                          }`}
                        >
                          {formatTime(slot.start_time)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1 px-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <span className="text-sm font-medium text-emerald-800">
                        Selected: <span className="font-bold">{formatTime(selectedStartTime)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStartTime('');
                          setSelectedEndTime('');
                        }}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold underline"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {/* End Time Select Panel */}
                {selectedStartTime && (
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">End Time</label>
                    <div className="grid grid-cols-3 gap-2">
                      {validEnds.map((timeStr) => {
                        const startH = Number(selectedStartTime.split(':')[0]);
                        const endH = Number(timeStr.split(':')[0]);
                        const dur = endH - startH;
                        return (
                          <button
                            key={timeStr}
                            type="button"
                            onClick={() => setSelectedEndTime(timeStr)}
                            className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                              selectedEndTime === timeStr
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            {formatTime(timeStr)} ({dur} hr{dur > 1 ? 's' : ''})
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleSlotsContinue}
                      className="w-full mt-3 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      Confirm Time Range
                    </button>
                  </div>
                )}
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
        {step === 'review' && selectedSlot && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Review & Reservation</h2>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
                <p className="text-sm text-slate-500">Turf</p>
                <p className="font-semibold text-slate-800">{turf.name}</p>
                <p className="text-sm text-slate-500">{turf.location} · {selectedGround?.name}</p>
              </div>
              <div className="divide-y divide-slate-100">
                <ReviewRow icon={<Calendar className="w-4 h-4" />} label="Date" value={formatDate(selectedDate)} />
                <ReviewRow icon={<Clock className="w-4 h-4" />} label="Time" value={`${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}`} />
                <ReviewRow icon={<Clock className="w-4 h-4" />} label="Duration" value={`${duration} ${duration === 1 ? 'hour' : 'hours'}`} />
                <ReviewRow icon={<User className="w-4 h-4" />} label="Name" value={name} />
                <ReviewRow icon={<Phone className="w-4 h-4" />} label="Phone" value={phone} />
                <ReviewRow label="Total Price" value={`₹${totalPrice}`} />
                <ReviewRow label="Advance Required (25%)" value={`₹${advanceRequired}`} highlight />
                <ReviewRow label="Remaining Balance at Turf" value={`₹${remainingPrice}`} />
              </div>
              <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-100">
                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                  * A temporary reservation holds this slot for 5 minutes while you complete your advance payment.
                </p>
              </div>
            </div>
            <button
              onClick={handleReserve}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Reserve & Pay ₹${advanceRequired}`}
            </button>
          </div>
        )}

        {/* STEP PAYMENT: COUNTDOWN & PAYMENT SIMULATION */}
        {step === 'payment' && reservationBooking && (
          <div className="space-y-4">
            {/* Countdown Banner */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Reserved for you</p>
              <div className="text-3xl font-extrabold text-emerald-700 font-mono">
                {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </div>
              <p className="text-xs text-emerald-600">Complete your booking before the timer expires.</p>
            </div>

            {paymentError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{paymentError}</span>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 text-center">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Payment Breakdown</p>
                <p className="text-2xl font-black text-slate-800 mt-1">₹{advanceRequired}</p>
                <p className="text-xs text-slate-400">Total Booking: ₹{totalPrice} (₹{remainingPrice} unpaid)</p>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm font-semibold text-slate-700">Simulate UPI/Card Payment</p>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleSimulatePaymentSuccess}
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ₹${advanceRequired} (Simulate Success)`}
                  </button>
                  <button
                    onClick={handleSimulatePaymentFailure}
                    disabled={submitting}
                    className="w-full py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100 transition-colors"
                  >
                    Simulate Payment Failure
                  </button>
                </div>
              </div>
            </div>
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
                <ReviewRow label="Total Amount" value={`₹${totalPrice}`} />
                <ReviewRow label="Advance Paid" value={`₹${advanceRequired}`} highlight />
                <ReviewRow label="Remaining Balance" value={`₹${remainingPrice}`} />
                <ReviewRow label="Payment Status" value="Advance Paid" />
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
