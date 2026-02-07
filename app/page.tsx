'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    const initAndLogin = async () => {
      try {
        // 1. Initialize LIFF
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });

        // 2. Force Login if not authenticated
        if (!liff.isLoggedIn()) {
          liff.login();
          return; // Stop here, LINE will redirect back after login
        }

        // 3. Get LINE Profile
        const profile = await liff.getProfile();

        // 4. Server Action: Auto-Login or Auto-Register
        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          // 5. Success! Redirect to Dashboard
          router.push(`/dashboard?userId=${result.userId}`);
        } else {
          throw new Error(result.message || 'Login failed');
        }
      } catch (err: any) {
        console.error('LIFF/Auth Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to initialize.');
      }
    };

    initAndLogin();
  }, [router]);

  // --- RENDER UI ---

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Login Failed</h2>
        <p className="text-gray-600 mb-6">{errorMsg}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-gray-200 rounded-full text-gray-700 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Default Loading State (Clean & Professional)
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#06C755]"></div>
        {/* Optional: Add your Logo in the center if you have one */}
      </div>
      <p className="mt-6 text-gray-500 font-medium animate-pulse">
        Authenticating...
      </p>
    </div>
  );
}
