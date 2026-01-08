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
  
  const [profile, setProfile] = useState<any>(null)
  const [children, setChildren] = useState<any[]>([])
  
  // State for Switcher: null = Parent (Me), string = Child UUID
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null) 

  const [packages, setPackages] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 1. Initial Load: Get User + Children list
  useEffect(() => {
    if (!userId) return
    const fetchUser = async () => {
      // Get Parent Profile
      const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(user)

      // Get Children
      const { data: kids } = await supabase.from('child_profiles').select('*').eq('parent_id', userId)
      setChildren(kids || [])
    }
    fetchUser()
  }, [userId])

  // 2. Data Fetcher: Runs whenever the "Active Profile Tab" changes
  useEffect(() => {
    if (!userId) return
    setLoading(true)

    const fetchData = async () => {
      let pkgQuery = supabase.from('user_packages').select(`*, package_templates (name, extra_session_price)`).eq('status', 'active')
      let bookingQuery = supabase.from('bookings').select(`*, classes (*), child_profiles(nickname)`).order('class_date', { ascending: true })

      if (activeProfileId) {
        // CASE: Viewing a Child
        pkgQuery = pkgQuery.eq('child_id', activeProfileId)
        bookingQuery = bookingQuery.eq('child_id', activeProfileId)
      } else {
        // CASE: Viewing Parent (Me)
        // Important: Parent's own pack has child_id = NULL
        pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null)
        bookingQuery = bookingQuery.eq('user_id', userId).is('child_id', null)
      }

      const [{ data: packs }, { data: books }] = await Promise.all([pkgQuery, bookingQuery])
      
      setPackages(packs || [])
      setBookings(books || [])
      setLoading(false)
    }

    fetchData()
  }, [userId, activeProfileId])

  // 3. Handle Buying Extra Session
  const handleBuyExtra = async (pkg: any) => {
    const confirmMsg = `Buy 1 Extra Session for ${pkg.package_templates.name}?\nPrice: ${pkg.package_templates.extra_session_price} THB`
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    
    // Call our SQL function
    const { data, error } = await supabase.rpc('buy_extra_session', {
      p_user_id: userId,
      p_package_id: pkg.id
    });

    if (error) {
      alert("Error: " + error.message);
    } else if (data.success) {
      alert(`✅ Success! ${data.message}`);
      window.location.reload(); 
    } else {
      alert("❌ Failed: " + data.message);
    }
    setLoading(false);
  };

  if (!profile) return <div className="p-8 text-center">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Header & Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {profile.full_name}</h1>
          <p className="text-gray-500 text-sm">Manage bookings for you and your family</p>
        </div>
        <Link href="/" className="text-sm text-red-500 hover:underline">Log Out</Link>
      </div>

      {/* 🔹 PROFILE SWITCHER TABS */}
      <div className="flex space-x-2 bg-white p-2 rounded-lg shadow-sm border overflow-x-auto">
        <button
          onClick={() => setActiveProfileId(null)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
            ${activeProfileId === null ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          👤 My Profile
        </button>
        {children.map(child => (
          <button
            key={child.id}
            onClick={() => setActiveProfileId(child.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap
              ${activeProfileId === child.id ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            👶 {child.nickname}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading data...</div>
      ) : (
        <>
          {/* Active Package Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {activeProfileId ? "Child's Active Package" : "My Active Package"}
            </h2>
            {packages.length === 0 ? (
              <p className="text-gray-500 italic">No active packages found for this profile.</p>
            ) : (
              packages.map(pkg => (
                <div key={pkg.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xl font-bold text-blue-900">{pkg.package_templates.name}</span>
                      <p className="text-sm text-gray-500">Expires: {new Date(pkg.expiry_date).toLocaleDateString()}</p>
                      
                      {/* Extra Session Status Indicator */}
                      <div className="mt-2 text-xs font-medium text-gray-500 bg-gray-100 inline-block px-2 py-1 rounded">
                        Extras Used: {pkg.extra_sessions_purchased} / 2
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-3xl font-bold text-blue-600">{pkg.remaining_sessions}</span>
                      <span className="text-xs text-gray-400 uppercase">Sessions Left</span>
                    </div>
                  </div>

                  {/* BUY EXTRA BUTTON */}
                  {pkg.extra_sessions_purchased < 2 && (
                    <div className="mt-4 pt-3 border-t border-dashed flex justify-end">
                      <button
                        onClick={() => handleBuyExtra(pkg)}
                        className="flex items-center text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-md transition font-medium border border-indigo-200"
                      >
                        <span>⚡ Buy Extra Session (+1)</span>
                        <span className="ml-2 bg-white px-2 py-0.5 rounded text-indigo-600 text-xs shadow-sm">
                          ฿{pkg.package_templates.extra_session_price}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Schedule List */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Upcoming Schedule</h2>
              <Link 
                // 🔗 Pass the childId if we are currently viewing a child!
                href={`/book?userId=${userId}${activeProfileId ? `&childId=${activeProfileId}` : ''}`}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition shadow-sm"
              >
                + Book for {activeProfileId ? children.find(c => c.id === activeProfileId)?.nickname : 'Me'}
              </Link>
            </div>

            {bookings.length === 0 ? (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded border border-dashed">
                No classes booked yet.
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="border border-gray-200 rounded p-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition">
                    <div>
                      <p className="font-bold text-gray-800">
                        {new Date(booking.class_date).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                         ⏰ {new Date(booking.class_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         <span className="mx-2">•</span>
                         📍 {booking.classes.location}
                      </p>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold
                        ${booking.status === 'booked' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {booking.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <Suspense fallback={<div>Loading...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}