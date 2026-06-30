import prisma from "@/lib/prisma";
import { History } from "lucide-react";
import { getSessionOrRedirect } from "@/lib/session";
import { canManageSettings } from "@/lib/access";
import { redirect } from "next/navigation";
import { AuditClient } from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });
  // Denetim kaydı yalnız ADMIN/PMO içindir (INV-4: yetki genişletilmez).
  if (!dbUser || !canManageSettings(dbUser.role)) {
    redirect("/");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { actor: { select: { id: true, name: true } } },
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="text-blue-500" />
          Denetim Kaydı
        </h1>
        <p className="text-zinc-400 mt-2">
          Tüm yönetişim mutasyonlarının alan düzeyinde eski/yeni değişiklik kaydı (FR-39…42). Son 500 kayıt.
        </p>
      </div>

      <AuditClient logs={logs as never} />
    </div>
  );
}
