'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createMockSession } from '@/app/actions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function MockLoginContent() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*, child_profiles(id)')
          .order('full_name');
        if (error) throw error;
        setUsers(data || []);
      } catch (err) {
        console.error('Error fetching mock users:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleLogin = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setError('');

    const result = await createMockSession(selectedUser);

    if (result.success) {
      router.replace('/dashboard');
    } else {
      setError(result.message || 'Login failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-blue-900">
            ProKick Dev Login
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Select a profile to bypass LINE Auth
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-gray-400 text-sm">Loading profiles...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select User
              </label>
              <select
                className="block w-full pl-3 pr-10 py-3 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md text-black bg-white"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                <option value="" disabled>
                  -- Choose a Profile --
                </option>
                {users.map((user) => {
                  const childCount = user.child_profiles?.length || 0;
                  return (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.nickname || 'Unknown User'}{' '}
                      {childCount > 0
                        ? `(Parent - ${childCount} kids)`
                        : '(Player)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={!selectedUser || submitting}
              className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors
                ${
                  selectedUser && !submitting
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
            >
              {submitting ? 'Logging in...' : 'Enter Dashboard →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
