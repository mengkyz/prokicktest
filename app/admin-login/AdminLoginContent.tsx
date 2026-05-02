'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminUserList, createAdminSession } from '@/app/actions';
import { ShieldCheck, User, Loader2 } from 'lucide-react';

type Step = 'enter-code' | 'select-user';

export default function AdminLoginContent() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('enter-code');
  const [secretCode, setSecretCode] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await getAdminUserList(secretCode);

    if (result.success && result.users) {
      setUsers(result.users);
      setStep('select-user');
    } else {
      setError(result.message || 'Invalid code');
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setError('');

    const result = await createAdminSession(selectedUserId, secretCode);

    if (result.success) {
      router.replace('/dashboard');
    } else {
      setError(result.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-2xl space-y-6 border border-gray-700">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            Admin Access
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            ProKick Academy — Restricted
          </p>
        </div>

        {step === 'enter-code' ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Admin Secret Code
              </label>
              <input
                type="password"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                placeholder="Enter admin code"
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !secretCode.trim()}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select User to Login As
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      selectedUserId === user.id
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                    }`}
                  >
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-gray-300 shrink-0">
                      <User size={16} />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {user.nickname || user.full_name || 'Unknown'}
                      </p>
                      <p className="text-gray-400 text-xs">{user.full_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('enter-code'); setSelectedUserId(''); setError(''); }}
                className="flex-1 py-2.5 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleLogin}
                disabled={!selectedUserId || loading}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'Logging in...' : 'Login →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
