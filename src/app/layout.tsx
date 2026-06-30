import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageSettings } from "@/lib/access";
import { getUnreadCount } from "./actions/notificationActions";

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
  const session = await getSession();
  let unreadCount = 0;
  let canViewAudit = false;
  if (session?.userId) {
    unreadCount = await getUnreadCount();
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    canViewAudit = canManageSettings(dbUser?.role);
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
