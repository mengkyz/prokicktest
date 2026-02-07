'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  // Guard to prevent running init twice in React Strict Mode
  const isRunning = useRef(false);

  useEffect(() => {
    const initAndLogin = async () => {
      // 1. Prevent double-execution
      if (isRunning.current) return;
      isRunning.current = true;

      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error(
            'LIFF ID is missing. Restart server after adding .env',
          );
        }

        // 2. Initialize LIFF (With Robust Error Handling)
        try {
          await liff.init({ liffId });
        } catch (err: any) {
          // In React Strict Mode, this error happens frequently. We can ignore it safely.
          if (err.code === 'ALREADY_INITIALIZED') {
            console.log('LIFF was already initialized. Continuing...');
          } else {
            // Real error (e.g., wrong ID, network issue) -> Stop everything
            throw err;
          }
        }

        // 3. Check Authentication
        if (!liff.isLoggedIn()) {
          // If not logged in, redirect to LINE Login screen
          // We explicitly tell LINE to come back to *this* page after login
          liff.login({ redirectUri: window.location.href });
          return; // Stop execution here, browser will redirect away
        }

        // 4. Get Profile Data
        const profile = await liff.getProfile();

        // 5. Server Action: Auto-Login or Auto-Register
        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          // 6. Success! Redirect to Dashboard
          router.push(`/dashboard?userId=${result.userId}`);
        } else {
          throw new Error(result.message || 'Login failed');
        }
      } catch (err: any) {
        console.error('LIFF Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to initialize.');
        // Allow user to retry if it was a glitch
        isRunning.current = false;
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

  // Default Loading State
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
