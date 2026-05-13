import prisma from "@/lib/prisma";
import { AlertCircle } from "lucide-react";
import { CountermeasureClient } from "./CountermeasureClient";
import { getSessionOrRedirect } from "@/lib/session";
import { countermeasureListScopeFilter, type UserScope } from "@/lib/dataScope";
import { redirect } from "next/navigation";

export default async function Countermeasures() {
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
  const cmListWhere = countermeasureListScopeFilter(scope);

  const countermeasures = await prisma.countermeasure.findMany({
    ...(cmListWhere ? { where: cmListWhere } : {}),
    include: {
      kpi: true,
      ownerUser: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
          <AlertCircle className="text-amber-500" />
          Karşı Önlemler (Countermeasures / A3)
        </h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          Kırmızı (Sapan) KPI'lar için alınan aksiyonlar ve kök neden analizleri. Kurum geneli rolünüz yoksa yalnızca
          sahibi olduğunuz veya KPI kapsamınızdaki kayıtlar listelenir.
        </p>
      </div>

      <CountermeasureClient countermeasures={countermeasures} />
    </div>
  );
}
