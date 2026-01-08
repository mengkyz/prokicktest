'use client'

import { useEffect, useState, Suspense } from 'react' // Import Suspense
import { createClient } from '@supabase/supabase-js'
import { useSearchParams, useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 1. Separate the Logic Component
function BookSessionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const userId = searchParams.get('userId')

  const [classes, setClasses] = useState<any[]>([])
  const [userPackage, setUserPackage] = useState<any>(null)
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

      // 2. Get User's First Active Package
      if (userId) {
        const { data: pkgData } = await supabase
          .from('user_packages')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
          .single()
        
        setUserPackage(pkgData)
      }
    }
    init()
  }, [userId])

  const handleBook = async (classId: string) => {
    if (!userPackage) return alert("No active package found!")
    setLoading(true)

    const { data, error } = await supabase.rpc('book_class', {
      p_user_id: userId,
      p_child_id: null,
      p_package_id: userPackage.id,
      p_class_id: classId
    })

    setLoading(false)

    if (error) {
      alert("Error: " + error.message)
    } else if (data.success) {
      alert("✅ Success: " + data.message)
      router.push(`/dashboard?userId=${userId}`)
    } else {
      alert("❌ Failed: " + data.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Select a Class</h1>
      
      <div className="grid gap-4">
        {classes.map((cls) => (
          <div key={cls.id} className="bg-white p-5 rounded-lg shadow hover:shadow-md transition flex justify-between items-center">
            <div>
              <p className="font-bold text-lg text-gray-800">
                {new Date(cls.start_time).toLocaleDateString()} 
                <span className="text-gray-400 mx-2">|</span> 
                {new Date(cls.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </p>
              <p className="text-gray-500">{cls.location}</p>
              <p className="text-sm text-blue-600 mt-1">
                {cls.current_bookings} / {cls.max_capacity} Spots Filled
              </p>
            </div>
            
            <button
              onClick={() => handleBook(cls.id)}
              disabled={loading || cls.current_bookings >= cls.max_capacity}
              className={`px-6 py-2 rounded-md font-medium text-white transition
                ${cls.current_bookings >= cls.max_capacity 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {loading ? 'Booking...' : (cls.current_bookings >= cls.max_capacity ? 'Full' : 'Book Now')}
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => router.back()} className="mt-6 text-gray-500 hover:text-gray-800">
        ← Back to Dashboard
      </button>
    </div>
  )
}

// 2. Export the Main Page with Suspense
export default function BookSession() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <Suspense fallback={<div className="text-center p-10">Loading Booking Options...</div>}>
        <BookSessionContent />
      </Suspense>
    </div>
  )
}