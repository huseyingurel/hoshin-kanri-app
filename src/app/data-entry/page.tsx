import prisma from "@/lib/prisma";
import { DataEntryClient } from "./DataEntryClient";
import { FileEdit } from "lucide-react";
import { getRagSettings } from "../actions/settingActions";
import { getSessionOrRedirect } from "@/lib/session";
import { kpiScopeFilter, type UserScope } from "@/lib/dataScope";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DataEntryPage() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, departmentId: true },
  });
  if (!dbUser) redirect("/login");

  const scope: UserScope = {
    id: dbUser.id,
    role: dbUser.role,
    departmentId: dbUser.departmentId,
  };
  const kWhere = kpiScopeFilter(scope);

  const kpis = await prisma.kPI.findMany({
    ...(kWhere ? { where: kWhere } : {}),
    select: {
      id: true,
      name: true,
      unit: true,
      targetYear: true,
    },
    orderBy: { name: "asc" },
  });

  const settings = await getRagSettings();

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileEdit className="text-blue-500" />
          Veri Girişi
        </h1>
        <p className="text-zinc-400 mt-2">Dönem bazlı KPI hedeflerini ve gerçekleşen değerlerini sisteme işleyin.</p>
      </div>

      <DataEntryClient kpis={kpis} settings={settings} />
    </div>
  );
}
