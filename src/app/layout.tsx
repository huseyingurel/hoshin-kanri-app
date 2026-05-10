import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hoshin Kanri Platform",
  description: "Strategy Deployment & Review Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-50 flex h-screen overflow-hidden`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-zinc-900/50 p-8 rounded-tl-3xl border-t border-l border-zinc-800 shadow-2xl">
          {children}
        </main>
      </body>
    </html>
  );
}
