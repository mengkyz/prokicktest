'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import liff from '@line/liff';
import { loginOrRegisterLineUser } from './actions';

let liffInitPromise: Promise<void> | null = null;

const ALLOWED_REDIRECTS: Record<string, string> = {
  book: '/book',
  packages: '/packages',
  dashboard: '/dashboard',
};

function getRedirectPath(): string {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') ?? '';
  return ALLOWED_REDIRECTS[redirect] ?? '/dashboard';
}

export default function LoginPage() {
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>(
    'loading',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  useEffect(() => {
    const runAuth = async () => {
      try {
        const dest = getRedirectPath();

        // --- FAST PASS: check if we already have a valid server session ---
        // localStorage hint tells us whether to bother checking (avoids an
        // unnecessary network round-trip on first-ever visit).
        const hadSession = !!localStorage.getItem('prokick_user_id');
        if (hadSession) {
          const resp = await fetch('/api/auth/session');
          if (resp.ok) {
            router.replace(dest);
            return;
          }
          // Stale hint — clear it and fall through to full LIFF auth
          localStorage.removeItem('prokick_user_id');
        }

        // --- LIFF INITIALIZATION ---
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error('LIFF ID missing.');

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Connection timed out. Please try again.')),
            5000,
          ),
        );

        if (!liffInitPromise) {
          liffInitPromise = liff.init({ liffId });
        }

        await Promise.race([liffInitPromise, timeoutPromise]);

        // --- LINE AUTHENTICATION ---
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        // --- SERVER SYNC + SESSION COOKIE ---
        const profile = await liff.getProfile();

        const result = await loginOrRegisterLineUser({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        if (result.success && result.userId) {
          // Store as hint only — the real auth is the HTTP-only cookie set by
          // loginOrRegisterLineUser on the server.
          localStorage.setItem('prokick_user_id', result.userId);

          router.replace(dest); // No userId in URL — session cookie carries identity
        } else {
          throw new Error(result.message || 'Login failed.');
        }
      } catch (err: any) {
        console.error('Login Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Unexpected error.');
        liffInitPromise = null;
      }
    };

    runAuth();
  }, [router]);

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
