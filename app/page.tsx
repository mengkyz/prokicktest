'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function BookingTest() {
  // State for inputs
  const [formData, setFormData] = useState({
    userId: '',
    childId: '',
    packageId: '',
    classId: ''
  })
  
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<any>(null)

  // Handle Input Changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // The Booking Function
  const handleBooking = async () => {
    setLoading(true)
    setResponse(null)

    try {
      // Calling the Database RPC function we created
      const { data, error } = await supabase.rpc('book_class', {
        p_user_id: formData.userId,
        p_child_id: formData.childId || null, // specific handling for empty string
        p_package_id: formData.packageId,
        p_class_id: formData.classId
      })

      if (error) throw error
      setResponse(data)

    } catch (err: any) {
      setResponse({ error: err.message || err })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">ProKick API Tester</h1>
        
        <div className="space-y-4">
          
          {/* User ID Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700">User ID (Parent/Adult)</label>
            <input 
              name="userId" 
              placeholder="Paste User UUID"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-black"
              onChange={handleChange}
            />
          </div>

          {/* Child ID Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Child ID (Optional)</label>
            <input 
              name="childId" 
              placeholder="Paste Child UUID (Leave empty for Adult)"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-black"
              onChange={handleChange}
            />
          </div>

          {/* Package ID Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Package ID</label>
            <input 
              name="packageId" 
              placeholder="Paste Package UUID"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-black"
              onChange={handleChange}
            />
          </div>

          {/* Class ID Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Class ID</label>
            <input 
              name="classId" 
              placeholder="Paste Class UUID"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 text-black"
              onChange={handleChange}
            />
          </div>

          {/* Action Button */}
          <button
            onClick={handleBooking}
            disabled={loading}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
              ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? 'Sending Request...' : 'Book Class via RPC'}
          </button>

        </div>

        {/* Response Display */}
        {response && (
          <div className={`mt-6 p-4 rounded-md ${response.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <h3 className="text-sm font-medium text-gray-900 mb-2">Server Response:</h3>
            <pre className="text-xs bg-gray-800 text-green-400 p-3 rounded overflow-auto">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}

      </div>
    </div>
  )
}