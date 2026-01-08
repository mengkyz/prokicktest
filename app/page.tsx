'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const [users, setUsers] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchUsers = async () => {
      // Fetch users AND their children count to identify parents
      const { data } = await supabase
        .from('profiles')
        .select('*, child_profiles(id)')
        .order('full_name')
      
      setUsers(data || [])
      setLoading(false)
    }
    fetchUsers()
  }, [])

  const handleLogin = () => {
    if (selectedUser) {
      router.push(`/dashboard?userId=${selectedUser}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-blue-900">ProKick Login</h1>
          <p className="mt-2 text-sm text-gray-500">Select a user profile to simulate access</p>
        </div>

        {loading ? (
          <p className="text-center text-gray-400">Loading profiles...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select User</label>
              <select
                className="block w-full pl-3 pr-10 py-3 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-black"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                <option value="" disabled>-- Choose a Profile --</option>
                {users.map((user) => {
                  const childCount = user.child_profiles?.length || 0
                  return (
                    <option key={user.id} value={user.id}>
                      {user.full_name} {childCount > 0 ? `(👨‍👩‍👧 Parent - ${childCount} kids)` : '(👤 Player)'}
                    </option>
                  )
                })}
              </select>
            </div>

            <button
              onClick={handleLogin}
              disabled={!selectedUser}
              className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors
                ${selectedUser ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
            >
              Enter Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}