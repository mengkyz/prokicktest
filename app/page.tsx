'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

// -----------------------------------------------------------------------------
// GLOBAL CACHE: Prevents double-init across React Remounts (Strict Mode)
// -----------------------------------------------------------------------------
let liffInitPromise: Promise<void> | null = null;

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    const runAuth = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error(
            'LIFF ID is missing. Check .env.local and restart server.',
          );
        }

        // 1. Initialize LIFF (Guaranteed ONCE)
        if (!liffInitPromise) {
          liffInitPromise = liff.init({ liffId });
        }
        await liffInitPromise;

        // 2. Check Authentication
        if (!liff.isLoggedIn()) {
          // Redirect to LINE Login and come back to this exact page
          liff.login({ redirectUri: window.location.href });
          return; // Stop execution, browser will redirect
        }

        // 3. Get Profile
        const profile = await liff.getProfile();

        // 4. Server Action: Login/Register
        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          router.push(`/dashboard?userId=${result.userId}`);
        } else {
          throw new Error(result.message || 'Login failed at server.');
        }
      } catch (err: any) {
        console.error('LIFF Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'An unexpected error occurred.');
        // If init failed, we clear the promise so the user can try again
        liffInitPromise = null;
      }
    };

    runAuth();
  }, [router]);

  // --- RENDER UI ---

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Login Failed</h2>
        <p className="text-gray-600 mb-6 max-w-sm">{errorMsg}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-gray-200 rounded-full text-gray-700 font-medium hover:bg-gray-300 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="relative flex flex-col items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#06C755]"></div>
      </div>
      <p className="mt-6 text-gray-500 font-medium animate-pulse">
        Authenticating with LINE...
      </p>
    </div>
  );
}
