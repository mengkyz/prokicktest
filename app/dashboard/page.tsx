'use client'

import { useEffect, useState, Suspense } from 'react' // Import Suspense
import { createClient } from '@supabase/supabase-js'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 1. Separate Logic Component
function DashboardContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')
  
  const [profile, setProfile] = useState<any>(null)
  const [packages, setPackages] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    const fetchData = async () => {
      // 1. Get Profile
      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', userId).single()
      setProfile(profileData)

      // 2. Get Packages
      const { data: packageData } = await supabase
        .from('user_packages')
        .select(`*, package_templates (name)`)
        .eq('user_id', userId)
        .eq('status', 'active')
      setPackages(packageData || [])

      // 3. Get Bookings
      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`*, classes (*), child_profiles(nickname)`)
        .eq('user_id', userId)
        .order('class_date', { ascending: true })
      setBookings(bookingData || [])

      setLoading(false)
    }
    fetchData()
  }, [userId])

  if (loading) return <div className="p-8">Loading Dashboard...</div>
  if (!profile) return <div className="p-8">User not found</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hello, {profile.full_name} 👋</h1>
          <p className="text-gray-500">Player Dashboard</p>
        </div>
        <Link href="/" className="text-sm text-red-500 hover:underline">Log Out</Link>
      </div>

      {/* Package Card */}
      <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Active Package</h2>
        {packages.length === 0 ? (
          <p className="text-gray-500">No active packages found.</p>
        ) : (
          packages.map(pkg => (
            <div key={pkg.id} className="flex justify-between items-center">
              <div>
                <span className="text-xl font-bold text-blue-900">{pkg.package_templates.name}</span>
                <p className="text-sm text-gray-500">Expires: {new Date(pkg.expiry_date).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <span className="block text-3xl font-bold text-blue-600">{pkg.remaining_sessions}</span>
                <span className="text-xs text-gray-400 uppercase">Sessions Left</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bookings List */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Your Schedule</h2>
          <Link 
            href={`/book?userId=${userId}`}
            className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition"
          >
            + Book Session
          </Link>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded">
            No upcoming classes booked.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="border border-gray-200 rounded p-4 flex justify-between items-center bg-gray-50">
                <div>
                  <p className="font-bold text-gray-800">
                    {new Date(booking.class_date).toLocaleDateString()} @ {new Date(booking.class_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                  <p className="text-sm text-gray-600">{booking.classes.location}</p>
                  {booking.child_profiles && (
                    <span className="inline-block mt-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      Player: {booking.child_profiles.nickname}
                    </span>
                  )}
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
    </div>
  )
}

// 2. Export Main Page with Suspense
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <Suspense fallback={<div className="text-center p-10">Loading User Data...</div>}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}