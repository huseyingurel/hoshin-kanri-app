import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageSettings } from "@/lib/access";
import { getUnreadCount } from "./actions/notificationActions";
import { logEvent } from "@/lib/log";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hoshin Kanri Platform",
  description: "Strategy Deployment & Review Platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Kenar çubuğu rozeti + denetim menüsü için oturum bağlamı (oturum yoksa güvenli varsayılan).
  // Bunlar yardımcı süslemelerdir: kök layout her rotada çalıştığından, buradaki bir DB hatası
  // tüm uygulamayı düşürmemeli. Hata sessizce yutulmaz — loglanır (INV-7) — ama güvenli
  // varsayılanlarla (rozet gizli, denetim menüsü gizli) render edilir.
  let unreadCount = 0;
  let canViewAudit = false;
  try {
    const session = await getSession();
    if (session?.userId) {
      unreadCount = await getUnreadCount();
      const dbUser = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true },
      });
      canViewAudit = canManageSettings(dbUser?.role);
    }
  } catch (e) {
    logEvent("error", "layout.context.failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-50 flex h-screen overflow-hidden`}>
        <Sidebar unreadCount={unreadCount} canViewAudit={canViewAudit} />
        <main className="flex-1 overflow-y-auto bg-zinc-900/50 p-8 rounded-tl-3xl border-t border-l border-zinc-800 shadow-2xl">
          {children}
        </main>
      </body>
    </html>
  );
}
