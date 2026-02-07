'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  // 1. FIX: Use a ref to track if initialization has started.
  // This prevents 'useEffect' from running twice in React Strict Mode (Development).
  const isRunning = useRef(false);

  useEffect(() => {
    const initAndLogin = async () => {
      // 2. Prevent double-execution
      if (isRunning.current) return;
      isRunning.current = true;

      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error('LIFF ID is missing. Check your .env file.');
        }

        // 3. Initialize LIFF
        // We catch initialization errors specifically to reset the ref if needed
        try {
          await liff.init({ liffId });
        } catch (initError) {
          // If LIFF is already initialized, we can proceed safely
          if (liff.id) {
            console.log('LIFF already initialized');
          } else {
            throw initError;
          }
        }

        // 4. Check Authentication
        if (!liff.isLoggedIn()) {
          // If using standard browser, this redirects.
          // If inside LINE App, isLoggedIn is usually true immediately.
          liff.login();
          return; // Stop execution while redirect happens
        }

        // 5. Get Profile Data
        const profile = await liff.getProfile();

        // 6. Call Server Action to Login/Register
        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          router.push(`/dashboard?userId=${result.userId}`);
        } else {
          throw new Error(result.message || 'Account creation failed');
        }
      } catch (err: any) {
        console.error('LIFF/Auth Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to connect to LINE.');
        // Allow retry if it failed
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
        <p className="text-gray-600 mb-6">{errorMsg}</p>
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
