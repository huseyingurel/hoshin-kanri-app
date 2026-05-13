import prisma from "@/lib/prisma";
import { canManageSettings } from "@/lib/access";
import { getSessionOrRedirect } from "@/lib/session";
import { redirect } from "next/navigation";
import { getRagSettings } from "../actions/settingActions";
import { SettingsClient } from "./SettingsClient";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });

  if (!dbUser) redirect("/login");
  if (!canManageSettings(dbUser.role)) redirect("/");

  const ragSettings = await getRagSettings();

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
          <Settings className="text-zinc-500" />
          Sistem Ayarları
        </h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          Hoshin Kanri platformunun çalışma kurallarını, RAG hesaplama eşiklerini ve diğer sistem parametrelerini bu sayfadan yönetebilirsiniz.
        </p>
      </div>

      <SettingsClient initialRagSettings={ragSettings} />
    </div>
  );
}
