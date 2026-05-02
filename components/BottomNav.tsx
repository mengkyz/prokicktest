'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, CalendarCheck, CreditCard, Users } from 'lucide-react';
import { Kanit } from 'next/font/google';
import { useLanguage } from '@/lib/LanguageContext';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

interface Props {
  userId: string;
}

export default function BottomNav({ userId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();

  const navItems = [
    { label: t.nav.home, icon: <Home size={22} />, path: '/dashboard' },
    { label: t.nav.bookings, icon: <CalendarCheck size={22} />, path: '/book' },
    { label: t.nav.packages, icon: <CreditCard size={22} />, path: '/packages' },
    { label: t.nav.profile, icon: <Users size={22} />, path: '/profile' },
  ];

  return (
    <div
      className={`absolute bottom-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-between items-center px-8 py-3 pb-6 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] ${kanit.className}`}
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.path ||
          (item.path !== '/dashboard' && pathname?.startsWith(item.path));

        return (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
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
