'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Home, CalendarCheck, CreditCard, Users } from 'lucide-react';
import { Kanit } from 'next/font/google';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Get the current userId from the URL
  const userId = searchParams.get('userId');

  // 2. Helper to construct paths with the userId
  const handleNavigation = (path: string) => {
    if (!userId) {
      // Safety: If no userId is found, redirect to login/home
      router.push('/');
      return;
    }
    router.push(`${path}?userId=${userId}`);
  };

  const navItems = [
    { label: 'Home', icon: <Home size={22} />, path: '/dashboard' },
    { label: 'Bookings', icon: <CalendarCheck size={22} />, path: '/book' },
    { label: 'Packages', icon: <CreditCard size={22} />, path: '/packages' },
    { label: 'Profile', icon: <Users size={22} />, path: '/profile' }, // Placeholder
  ];

  return (
    <div
      className={`absolute bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-between items-center px-8 py-3 pb-6 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] ${kanit.className}`}
    >
      {navItems.map((item) => {
        // Active state check
        const isActive =
          pathname === item.path ||
          (item.path !== '/dashboard' && pathname?.startsWith(item.path));

        return (
          <button
            key={item.path}
            // 3. Use the helper function instead of direct string
            onClick={() => handleNavigation(item.path)}
            className="flex flex-col items-center gap-1 w-full transition-all duration-200 active:scale-95 group"
          >
            <div
              className={`p-1.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-50 text-[#1e2e5c]' : 'text-gray-400 group-hover:text-gray-600'}`}
            >
              {item.icon}
            </div>
            <span
              className={`text-[10px] font-bold transition-colors ${isActive ? 'text-[#1e2e5c]' : 'text-gray-400'}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
