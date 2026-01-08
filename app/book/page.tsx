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
  const childId = searchParams.get('childId') // Now reading childId!

  const [classes, setClasses] = useState<any[]>([])
  const [activePackage, setActivePackage] = useState<any>(null)
  const [childName, setChildName] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      // 1. Get Future Classes
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .gt('start_time', new Date().toISOString())
        .order('start_time')
      setClasses(classData || [])

      // 2. Determine whose package to fetch
      let pkgQuery = supabase.from('user_packages').select('id, remaining_sessions').eq('status', 'active').limit(1)

      if (childId) {
        // Fetch Child Info (for display name)
        const { data: child } = await supabase.from('child_profiles').select('nickname').eq('id', childId).single()
        if (child) setChildName(child.nickname)
        
        // Fetch Child's Package
        pkgQuery = pkgQuery.eq('child_id', childId)
      } else {
        // Fetch Parent's Package
        pkgQuery = pkgQuery.eq('user_id', userId).is('child_id', null)
      }

      const { data: pkgData } = await pkgQuery.single()
      setActivePackage(pkgData)
    }
    init()
  }, [userId, childId])

  const handleBook = async (classId: string) => {
    if (!activePackage) return alert("No active package found for this profile!")
    setLoading(true)

    // Call RPC with correct child_id (null if booking for self)
    const { data, error } = await supabase.rpc('book_class', {
      p_user_id: userId,
      p_child_id: childId || null, 
      p_package_id: activePackage.id,
      p_class_id: classId
    })

    setLoading(false)

    if (error) {
      alert("Error: " + error.message)
    } else if (data.success) {
      alert("✅ Success: " + data.message)
      // Return to dashboard preserving the selected child view
      router.push(`/dashboard?userId=${userId}`)
    } else {
      alert("❌ Failed: " + data.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Select a Class</h1>
        <p className="text-gray-600">
          Booking for: <span className="font-bold text-blue-600">{childName || "Myself (Parent)"}</span>
        </p>
        {activePackage ? (
          <p className="text-sm text-green-600 mt-1">✓ Active Package Found ({activePackage.remaining_sessions} sessions left)</p>
        ) : (
          <p className="text-sm text-red-500 mt-1">⚠ No active package found. You cannot book.</p>
        )}
      </div>
      
      <div className="grid gap-4">
        {classes.map((cls) => (
          <div key={cls.id} className="bg-white p-5 rounded-lg shadow hover:shadow-md transition flex justify-between items-center border border-gray-100">
            <div>
              <p className="font-bold text-lg text-gray-800">
                {new Date(cls.start_time).toLocaleDateString()} 
              </p>
              <p className="text-gray-500 text-sm">
                 ⏰ {new Date(cls.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 <span className="mx-2">|</span> 
                 📍 {cls.location}
              </p>
              <p className="text-xs text-blue-600 mt-2 font-medium bg-blue-50 inline-block px-2 py-1 rounded">
                {cls.current_bookings} / {cls.max_capacity} Spots Filled
              </p>
            </div>
            
            <button
              onClick={() => handleBook(cls.id)}
              disabled={loading || cls.current_bookings >= cls.max_capacity || !activePackage}
              className={`px-6 py-2 rounded-md font-medium text-white transition shadow-sm
                ${(loading || !activePackage || cls.current_bookings >= cls.max_capacity)
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {loading ? '...' : (cls.current_bookings >= cls.max_capacity ? 'Full' : 'Book')}
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => router.back()} className="mt-8 text-gray-500 hover:text-gray-800 flex items-center gap-2">
        ← Cancel & Return
      </button>
    </div>
  )
}

export default function BookSession() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Suspense fallback={<div>Loading Booking Options...</div>}>
        <BookSessionContent />
      </Suspense>
    </div>
  )
}