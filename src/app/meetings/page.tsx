import { getReviews, getReviewAgendaItems } from "../actions/reviewActions";
import prisma from "@/lib/prisma";
import { ReviewClient } from "./ReviewClient";
import { Users } from "lucide-react";
import { getSessionOrRedirect } from "@/lib/session";
import { isOrgWideRole } from "@/lib/access";
import { redirect } from "next/navigation";

export default async function MeetingsPage() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, departmentId: true },
  });
  if (!dbUser) redirect("/login");

  const reviews = await getReviews();
  const { activeRedKpis, openCountermeasures } = await getReviewAgendaItems();

  const orderBy = { name: "asc" as const };
  const users = isOrgWideRole(dbUser.role)
    ? await prisma.user.findMany({ orderBy })
    : dbUser.departmentId
      ? await prisma.user.findMany({
          where: { departmentId: dbUser.departmentId },
          orderBy,
        })
      : await prisma.user.findMany({
          where: { id: session.userId },
          orderBy,
        });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
          <Users className="text-blue-500" />
          Değerlendirme Merkezi
        </h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          Sistemin, kırmızı KPI'lar ve açık aksiyonlar üzerinden otomatik toplantı/inceleme gündemi oluşturduğu ve
          kararların direkt aksiyona dönüştürüldüğü Değerlendirme Modülü.
        </p>
      </div>

      <ReviewClient
        reviews={reviews}
        activeRedKpis={activeRedKpis}
        openCountermeasures={openCountermeasures}
        users={users}
      />
    </div>
  );
}
