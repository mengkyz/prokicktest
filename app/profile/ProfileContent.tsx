'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Kanit } from 'next/font/google';
import { User, Pencil, Plus } from 'lucide-react';
import BottomNav from '@/components/BottomNav';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Props {
  userId: string;
}

export default function ProfileContent({ userId }: Props) {
  const router = useRouter();
  const [parent, setParent] = useState<any>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      const { data: c } = await supabase
        .from('child_profiles')
        .select('*')
        .eq('parent_id', userId);
      setParent(p);
      setChildren(c || []);
      setLoading(false);
    };
    fetchData();
  }, [userId]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-[#1e2e5c]">
        Loading...
      </div>
    );

  return (
    <div
      className={`min-h-screen bg-gray-50 flex justify-center ${kanit.className}`}
    >
      <div className="w-full max-w-md bg-white shadow-2xl relative flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center sticky top-0 bg-white z-20 border-b border-gray-50">
          <div className="w-8"></div>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">
            จัดการโปรไฟล์
          </h1>
          <div className="w-8"></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24 scrollbar-hide px-5 pt-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              โปรไฟล์ของคุณ
            </h2>
            <p className="text-gray-500 text-sm font-light mb-4">
              ข้อมูลผู้ปกครองและบุตรหลาน
            </p>

            <div className="space-y-4">
              {/* Parent */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-[#1e2e5c] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 overflow-hidden">
                    {parent?.avatar_url ? (
                      <img
                        src={parent.avatar_url}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={24} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 font-bold">
                        {parent?.nickname || parent?.full_name}
                      </span>
                      <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                        PARENT
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {parent?.full_name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    router.push(
                      `/profile/edit?targetId=${parent.id}&type=parent`,
                    )
                  }
                  className="p-2 text-gray-400 hover:text-[#1e2e5c] hover:bg-gray-50 rounded-lg"
                >
                  <Pencil size={18} />
                </button>
              </div>

              {/* Children */}
              {children.map((child) => (
                <div
                  key={child.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between hover:border-[#1e2e5c] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#c9b038] rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {child.nickname?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-bold">
                          {child.nickname}
                        </span>
                        <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                          JUNIOR
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Size: {child.jersey_size || '-'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      router.push(
                        `/profile/edit?targetId=${child.id}&type=child`,
                      )
                    }
                    className="p-2 text-gray-400 hover:text-[#1e2e5c] hover:bg-gray-50 rounded-lg"
                  >
                    <Pencil size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Button */}
        <div className="absolute bottom-[70px] w-full px-6 py-4 pointer-events-none">
          <button
            onClick={() => router.push('/profile/add')}
            className="w-full bg-[#1e2e5c] text-white py-3.5 rounded-xl font-bold text-base shadow-lg active:scale-[0.99] transition-transform flex items-center justify-center gap-2 pointer-events-auto hover:bg-[#2b4185]"
          >
            <Plus size={20} /> เพิ่มโปรไฟล์เด็ก
          </button>
        </div>

        <BottomNav userId={userId} />
      </div>
    </div>
  );
}
