'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSearchParams, useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function BookSessionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const userId = searchParams.get('userId')
  const childId = searchParams.get('childId') // If present, we are booking for a child

  const [classes, setClasses] = useState<any[]>([])
  const [activePackages, setActivePackages] = useState<any[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  
  // New State: To track how many people are waiting for each class
  const [standbyCounts, setStandbyCounts] = useState<Record<string, number>>({})

  const [childName, setChildName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [bookingProcessing, setBookingProcessing] = useState(false)

  // 1. Initial Fetch
  useEffect(() => {
    if (!userId) return

    const init = async () => {
      setLoading(true)

      // A. Get Future Classes
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .gt('start_time', new Date().toISOString())
        .order('start_time')
      setClasses(classData || [])

      // B. Get Standby Counts (To show queue size)
      // We fetch all 'standby' bookings for future classes to count them
      const { data: standbyData } = await supabase
        .from('bookings')
        .select('class_id')
        .eq('status', 'standby')
        .gt('class_date', new Date().toISOString())
      
      // Aggregate counts: { "class_id_1": 3, "class_id_2": 0 }
      const counts: Record<string, number> = {}
      if (standbyData) {
        standbyData.forEach((b: any) => {
          counts[b.class_id] = (counts[b.class_id] || 0) + 1
        })
      }
      setStandbyCounts(counts)

      // C. Get User's Active Packages
      let pkgQuery = supabase
        .from('user_packages')
        .select('*, package_templates(name)')
        .eq('status', 'active')
        .gt('remaining_sessions', 0) // Must have sessions left to even join standby

      if (childId) {
        // Fetch Child Info
        const { data: child } = await supabase.from('child_profiles').select('nickname').eq('id', childId).single()
        if (child) setChildName(child.nickname)
        // Fetch Child's Packages
        pkgQuery = pkgQuery.eq('child_id', childId)
      } else {
        // Fetch Parent's Packages
        pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null)
      }

      const { data: pkgData } = await pkgQuery
      const packs = pkgData || []
      
      setActivePackages(packs)

      // SMART AUTO-SELECT
      if (packs.length === 1) {
        setSelectedPackageId(packs[0].id)
      }

      setLoading(false)
    }
    init()
  }, [userId, childId])

  // 2. Handle Booking
  const handleBook = async (classId: string) => {
    if (!selectedPackageId) {
      alert("Please select a package to use.")
      return
    }

    setBookingProcessing(true)

    // Call RPC - It handles the logic: 
    // If Full -> Adds to Standby & Does NOT deduct session
    // If Open -> Books & Deducts session
    const { data, error } = await supabase.rpc('book_class', {
      p_user_id: userId,
      p_child_id: childId || null, 
      p_package_id: selectedPackageId,
      p_class_id: classId
    })

    setBookingProcessing(false)

    if (error) {
      alert("Error: " + error.message)
    } else if (data.success) {
      // Custom message based on result status
      if (data.status === 'standby') {
        alert(`📝 Added to Standby List!\n\nYou are in the queue. We will notify you if a spot opens up. (No session deducted yet)`)
      } else {
        alert(`✅ Booking Confirmed!\n\nSee you on the field.`)
      }
      router.push(`/dashboard?userId=${userId}`)
    } else {
      alert("❌ Failed: " + data.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Book a Session</h1>
          <p className="text-gray-500">
            Booking for: <span className="font-bold text-blue-600">{childName || "Myself (Parent)"}</span>
          </p>
        </div>

        {/* PACKAGE SELECTOR */}
        {loading ? (
          <div className="text-center py-10 text-gray-400">Loading packages...</div>
        ) : activePackages.length === 0 ? (
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
            <p className="text-red-600 font-bold">⚠ No active packages found.</p>
            <p className="text-sm text-red-500 mt-1">Please buy a package on the dashboard first.</p>
            <button onClick={() => router.back()} className="mt-4 text-sm underline text-red-700">Go Back</button>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">
              Select Package to Use
            </h2>
            <div className="space-y-3">
              {activePackages.map((pkg) => (
                <label 
                  key={pkg.id} 
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all
                    ${selectedPackageId === pkg.id 
                      ? 'border-blue-600 bg-blue-50' 
                      : 'border-gray-100 hover:border-blue-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="packageSelect"
                      value={pkg.id}
                      checked={selectedPackageId === pkg.id}
                      onChange={() => setSelectedPackageId(pkg.id)}
                      className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="font-bold text-gray-900">{pkg.package_templates.name}</p>
                      <p className="text-xs text-gray-500">Expires: {new Date(pkg.expiry_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-bold text-blue-600 text-lg">{pkg.remaining_sessions}</span>
                    <span className="text-[10px] text-gray-400 uppercase">Left</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* CLASS LIST */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 pl-1">Available Classes</h2>
          
          {classes.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No upcoming classes found.</p>
          ) : (
            classes.map((cls) => {
              const isFull = cls.current_bookings >= cls.max_capacity;
              const queueSize = standbyCounts[cls.id] || 0; // Get queue size for this class

              return (
                <div key={cls.id} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg text-gray-800">
                        {new Date(cls.start_time).toLocaleDateString()}
                      </span>
                      {isFull && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold uppercase">
                          Waitlist Only
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm flex items-center gap-2">
                       ⏰ {new Date(cls.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                       <span className="text-gray-300">|</span> 
                       📍 {cls.location}
                    </p>
                    
                    {/* Status Indicator */}
                    <div className="mt-2 flex items-center gap-3">
                      <p className={`text-xs font-medium px-2 py-1 rounded-md
                        ${isFull ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50'}`}>
                        {cls.current_bookings} / {cls.max_capacity} Spots Filled
                      </p>
                      {isFull && (
                        <p className="text-xs text-gray-500">
                          👥 {queueSize} waiting in queue
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleBook(cls.id)}
                    disabled={bookingProcessing || !selectedPackageId}
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm transition shadow-sm border
                      ${(!selectedPackageId || bookingProcessing)
                        ? 'bg-gray-200 text-gray-400 border-transparent cursor-not-allowed' 
                        : isFull
                          ? 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300' // Standby Style
                          : 'bg-blue-600 text-white border-transparent hover:bg-blue-700 hover:shadow-md' // Normal Style
                      }`}
                  >
                    {bookingProcessing ? 'Processing...' : 
                      !selectedPackageId ? 'Select Package' :
                      isFull ? `Join Standby (Queue: ${queueSize})` : 'Book Session'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <button 
          onClick={() => router.back()} 
          className="block w-full text-center py-4 text-gray-500 hover:text-gray-800 font-medium transition"
        >
          ← Cancel & Return to Dashboard
        </button>

      </div>
    </div>
  )
}

export default function BookSession() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Booking Options...</div>}>
      <BookSessionContent />
    </Suspense>
  )
}