'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function DashboardContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')
  
  // Data State
  const [profile, setProfile] = useState<any>(null)
  const [children, setChildren] = useState<any[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null) // null = Parent
  
  const [packages, setPackages] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  
  // UI State
  const [loading, setLoading] = useState(true)
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [processing, setProcessing] = useState(false)

  // 1. Initial Load
  useEffect(() => {
    if (!userId) return
    const init = async () => {
      const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single()
      const { data: kids } = await supabase.from('child_profiles').select('*').eq('parent_id', userId)
      const { data: temps } = await supabase.from('package_templates').select('*').order('price')

      setProfile(user)
      setChildren(kids || [])
      setTemplates(temps || [])
    }
    init()
  }, [userId])

  // 2. Fetch Data (Reloadable)
  const loadDashboardData = async () => {
    if (!userId) return
    setLoading(true)

    let pkgQuery = supabase.from('user_packages').select(`*, package_templates (*)`).eq('status', 'active')
    let bookingQuery = supabase.from('bookings').select(`*, classes (*), child_profiles(nickname)`).neq('status', 'cancelled').order('class_date', { ascending: true })

    if (activeProfileId) {
      pkgQuery = pkgQuery.eq('child_id', activeProfileId)
      bookingQuery = bookingQuery.eq('child_id', activeProfileId)
    } else {
      pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null)
      bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null)
    }

    const [{ data: packs }, { data: books }] = await Promise.all([pkgQuery, bookingQuery])
    
    setPackages(packs || [])
    setBookings(books || [])
    setLoading(false)
  }

  useEffect(() => {
    loadDashboardData()
  }, [userId, activeProfileId])

  // 3. Actions
  const handleBuyExtra = async (pkg: any) => {
    if (!window.confirm(`Buy 1 Extra Session for ${pkg.package_templates.extra_session_price} THB?`)) return;
    setProcessing(true);
    const { data, error } = await supabase.rpc('buy_extra_session', { p_user_id: userId, p_package_id: pkg.id });
    if (data?.success) { alert(`✅ Success!`); loadDashboardData(); } 
    else alert(error?.message || data?.message);
    setProcessing(false);
  };

  const handleBuyPackage = async (templateId: number) => {
    if (!window.confirm("Confirm purchase?")) return;
    setProcessing(true)
    const { data, error } = await supabase.rpc('buy_new_package', {
      p_user_id: userId, p_child_id: activeProfileId, p_template_id: templateId
    })
    if (data?.success) { alert("✅ Purchased!"); loadDashboardData(); setShowBuyModal(false); }
    else alert(error?.message || data?.message);
    setProcessing(false)
  }

  // 4. NEW: Cancel Booking Action
  const handleCancelBooking = async (bookingId: string, classDate: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    setProcessing(true);

    const { data, error } = await supabase.rpc('cancel_booking', {
      p_booking_id: bookingId,
      p_user_id: userId // Parent ID validates ownership
    });

    if (error) {
      alert("Error: " + error.message);
    } else if (data.success) {
      alert("✅ Booking Cancelled. Session has been refunded.");
      loadDashboardData(); // Refresh list
    } else {
      alert("❌ Cancellation Failed: " + data.message);
    }
    setProcessing(false);
  }

  // Helper: Check if cancellable (Current Time < Start Time - 2 Hours)
  const isCancellable = (classDateStr: string) => {
    const classTime = new Date(classDateStr).getTime();
    const now = new Date().getTime();
    const twoHoursMs = 2 * 60 * 60 * 1000;
    return now < (classTime - twoHoursMs);
  }

  const availableTemplates = templates.filter(t => activeProfileId ? t.type === 'junior' : t.type === 'adult')

  if (!profile) return <div className="p-12 text-center text-gray-500">Loading User Profile...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-900">ProKick Dashboard</h1>
            <p className="text-gray-500">Welcome back, {profile.full_name}</p>
          </div>
          <Link href="/" className="text-sm font-medium text-red-500 hover:text-red-700 transition">Sign Out</Link>
        </div>

        {/* PROFILE TABS */}
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-xl overflow-x-auto shadow-inner">
          <button
            onClick={() => setActiveProfileId(null)}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeProfileId === null ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:bg-gray-300/50'}`}
          >
            👤 My Profile
          </button>
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => setActiveProfileId(child.id)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeProfileId === child.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:bg-gray-300/50'}`}
            >
              👶 {child.nickname}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading data...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* PACKAGES */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">{activeProfileId ? "Child's Packages" : "My Packages"}</h2>
                <button onClick={() => setShowBuyModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition">+ Buy Package</button>
              </div>

              {packages.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-dashed border-gray-300 text-center">
                  <p className="text-gray-500 mb-4">No active packages found.</p>
                  <button onClick={() => setShowBuyModal(true)} className="text-blue-600 font-bold hover:underline">Get Started &rarr;</button>
                </div>
              ) : (
                packages.map(pkg => (
                  <div key={pkg.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{pkg.package_templates.name}</h3>
                        <p className="text-sm text-gray-500">Expires: {new Date(pkg.expiry_date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-4xl font-extrabold text-blue-600">{pkg.remaining_sessions}</span>
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Sessions</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">Extras: {pkg.extra_sessions_purchased}/2</span>
                      {pkg.extra_sessions_purchased < 2 ? (
                        <button onClick={() => handleBuyExtra(pkg)} disabled={processing} className="text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">⚡ Buy Extra (฿{pkg.package_templates.extra_session_price})</button>
                      ) : <span className="text-xs text-orange-500 font-medium">Max Extras Reached</span>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* BOOKINGS (SCHEDULE) */}
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Schedule</h2>
                <Link href={`/book?userId=${userId}${activeProfileId ? `&childId=${activeProfileId}` : ''}`} className="text-sm font-bold text-green-600 hover:text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition">Book Class &rarr;</Link>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {bookings.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">No upcoming classes.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {bookings.map((booking) => {
                      const canCancel = isCancellable(booking.class_date);
                      return (
                        <div key={booking.id} className="p-4 hover:bg-gray-50 transition">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-gray-800">{new Date(booking.class_date).toLocaleDateString()}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${booking.status === 'booked' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{booking.status}</span>
                          </div>
                          <div className="text-sm text-gray-500 mb-2">
                             🕒 {new Date(booking.class_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • 📍 {booking.classes.location}
                          </div>
                          
                          {/* CANCEL BUTTON */}
                          {booking.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCancelBooking(booking.id, booking.class_date)}
                              disabled={!canCancel || processing}
                              className={`w-full text-center text-xs font-bold py-1.5 rounded border transition
                                ${canCancel 
                                  ? 'border-red-200 text-red-600 hover:bg-red-50' 
                                  : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'}`}
                            >
                              {canCancel ? 'Cancel Booking' : 'Too Late to Cancel'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* MODAL: BUY NEW PACKAGE */}
        {showBuyModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative">
              <button onClick={() => setShowBuyModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a Package</h2>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 mt-4">
                {availableTemplates.map(t => (
                  <div key={t.id} className="border border-gray-200 rounded-xl p-4 flex justify-between items-center hover:border-blue-500 transition group">
                    <div>
                      <h3 className="font-bold text-gray-800 group-hover:text-blue-700">{t.name}</h3>
                      <p className="text-sm text-gray-500">{t.session_count} Sessions • {t.days_valid} Days</p>
                    </div>
                    <button onClick={() => handleBuyPackage(t.id)} disabled={processing} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-600 transition">฿{t.price.toLocaleString()}</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  )
}