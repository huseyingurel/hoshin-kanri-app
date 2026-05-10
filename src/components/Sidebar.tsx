"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/authActions";
import { 
  LayoutDashboard, 
  Target, 
  CheckSquare, 
  BarChart2, 
  Users, 
  FileText, 
  CalendarDays,
  Settings,
  LogOut
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <div className="flex flex-col w-64 h-screen px-4 py-8 bg-zinc-950 text-zinc-300 border-r border-zinc-800 print-hidden">
      <h2 className="text-2xl font-bold text-white mb-8 px-2 flex items-center gap-2">
        <Target className="text-emerald-500" />
        HOSHIN KANRI
      </h2>
      <nav className="flex flex-col gap-2">
        <Link href="/my-tasks" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <CheckSquare size={20} />
          <span>Benim Görevlerim</span>
        </Link>
        <Link href="/my-kpis" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <BarChart2 size={20} />
          <span>Benim KPI'larım</span>
        </Link>
        <Link href="/my-reviews" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <Users size={20} />
          <span>Dönem Değerlendirmelerim</span>
        </Link>
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <LayoutDashboard size={20} />
          <span>Yönetici Paneli</span>
        </Link>
        <Link href="/strategy" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <Target size={20} />
          <span>X-Matrix / Hedef Ağacı</span>
        </Link>
        <Link href="/meetings" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <CalendarDays size={20} />
          <span>Review Toplantıları</span>
        </Link>
        <Link href="/reports" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <FileText size={20} />
          <span>Rapor Merkezi</span>
        </Link>
      </nav>
      <div className="mt-auto flex flex-col gap-1">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 hover:text-white transition-colors">
          <Settings size={20} />
          <span>Ayarlar</span>
        </Link>
        <div className="flex flex-col ml-9 pl-2 border-l border-zinc-800 gap-1 mt-1">
          <Link href="/settings/rules" className="text-sm text-zinc-400 hover:text-white transition-colors py-1">
            RAG & Otomasyon Kuralları
          </Link>
        </div>
        <button 
          onClick={() => logoutAction()} 
          className="flex items-center gap-3 px-3 py-2 mt-4 rounded-md text-rose-400 hover:bg-rose-500/10 transition-colors w-full text-left"
        >
          <LogOut size={20} />
          <span>Çıkış Yap</span>
        </button>
      </div>
    </div>
  );
}
