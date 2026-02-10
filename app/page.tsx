'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

// -----------------------------------------------------------------------------
// GLOBAL CACHE
// -----------------------------------------------------------------------------
let liffInitPromise: Promise<void> | null = null;

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>(
    'loading',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    const runAuth = async () => {
      try {
        // --- LEVEL 1: INSTANT LOGIN (The "Fast Pass") ---
        // If we have a stored UserID from a previous visit, use it immediately.
        // This makes the app feel "Native" and instant.
        const cachedUserId = localStorage.getItem('prokick_user_id');
        const cachedLineId = localStorage.getItem('prokick_line_token'); // Optional safety check

        if (cachedUserId) {
          console.log('⚡ Fast Pass Login');
          router.replace(`/dashboard?userId=${cachedUserId}`);
          // We still continue to initialize LIFF in the background to verify token,
          // but we don't block the user from seeing the UI.
          return;
        }

        // --- LEVEL 2: LIFF INITIALIZATION ---
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error('LIFF ID missing.');

        // Prevent "Hanging": Race LIFF init against a 5-second timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Connection timed out. Please try again.')),
            5000,
          ),
        );

        if (!liffInitPromise) {
          liffInitPromise = liff.init({ liffId });
        }

        // Wait for LIFF or Timeout
        await Promise.race([liffInitPromise, timeoutPromise]);

        // --- LEVEL 3: AUTHENTICATION ---
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        // --- LEVEL 4: SERVER SYNC ---
        const profile = await liff.getProfile();

        // Only run the server action if we don't have a cached ID (or to refresh it)
        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          // SAVE TO CACHE for next time
          localStorage.setItem('prokick_user_id', result.userId);
          localStorage.setItem('prokick_line_token', profile.userId);

          router.replace(`/dashboard?userId=${result.userId}`);
        } else {
          throw new Error(result.message || 'Login failed.');
        }
      } catch (err: any) {
        console.error('Login Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Unexpected error.');
        liffInitPromise = null; // Reset for retry
      }
    };

    runAuth();
  }, [router]);

  // --- RENDER UI ---

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-sm w-full">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Login Issue</h2>
          <p className="text-gray-600 mb-6 text-sm">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="relative flex flex-col items-center">
        {/* Custom ProKick Spinner or Logo here */}
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-6"></div>
        <h1 className="text-2xl font-black text-blue-900 tracking-tighter">
          ProKick
        </h1>
        <p className="mt-2 text-gray-400 text-xs font-medium animate-pulse">
          Authenticating...
        </p>
      </div>
    </div>
  );
}
