import { useState } from 'react';
import { CalendarDays, LayoutDashboard, MapPin } from 'lucide-react';
import CustomerBooking from '@/components/CustomerBooking';
import OwnerDashboard from '@/components/OwnerDashboard';
import OwnerLogin from '@/components/OwnerLogin';
import { useAuth } from '@/lib/useAuth';

type View = 'home' | 'customer' | 'owner';

export default function App() {
  const [view, setView] = useState<View>('home');
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (view === 'customer') return <CustomerBooking onExit={() => setView('home')} />;

  if (view === 'owner') {
    if (!user) {
      return <OwnerLogin onBack={() => setView('home')} />;
    }
    return <OwnerDashboard onSignOut={signOut} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12">
      {/* Logo / Brand */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 mb-4">
          <CalendarDays className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Smash Arena</h1>
        <p className="flex items-center justify-center gap-1 text-sm text-slate-500 mt-1">
          <MapPin className="w-3.5 h-3.5" /> Solapur
        </p>
      </div>

      {/* Interface selection */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => setView('customer')}
          className="w-full group flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all active:scale-[0.98] text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
            <CalendarDays className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-800">Book a Slot</p>
            <p className="text-sm text-slate-500">Reserve your turf time</p>
          </div>
        </button>

        <button
          onClick={() => setView('owner')}
          className="w-full group flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-400 hover:shadow-md transition-all active:scale-[0.98] text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
            <LayoutDashboard className="w-6 h-6 text-slate-700" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-800">Owner Dashboard</p>
            <p className="text-sm text-slate-500">Manage bookings & slots</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-10">Turf Booking System · Pay at Turf</p>
    </div>
  );
}
