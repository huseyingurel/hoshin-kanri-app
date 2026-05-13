import prisma from "@/lib/prisma";
import { Users, CalendarDays, UserCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionOrRedirect } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function MyReviewsPage() {
  const session = await getSessionOrRedirect();
  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true },
  });
  if (!dbUser) redirect("/login");

  const reviews = await prisma.review.findMany({
    where: {
      OR: [{ organizerId: dbUser.id }, { decisions: { some: { assigneeId: dbUser.id } } }],
    },
    orderBy: { date: "desc" },
    include: {
      organizer: true,
      decisions: {
        include: { assignee: true, kpi: true },
      },
    },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-100">
          <Users className="text-emerald-500" />
          Dönem Değerlendirmelerim
        </h1>
        <p className="text-zinc-400 mt-2 max-w-2xl">
          Düzenlediğiniz veya size atanmış kararları içeren review kayıtları. Kurum geneli roller dışında yalnızca sizinle ilişkili toplantılar listelenir.
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          <Users size={48} className="text-zinc-600 mb-4" />
          <p className="text-center max-w-md">Henüz size bağlı bir review veya atanmış karar kaydı yok.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {reviews.map((rev) => (
            <Card key={rev.id} className="bg-zinc-950 border-zinc-800">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg text-zinc-100">{rev.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-2 text-zinc-400">
                    <CalendarDays size={14} />
                    {new Date(rev.date).toLocaleString("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {rev.organizer && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <UserCircle size={14} />
                        {rev.organizer.name}
                      </>
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0 bg-zinc-900 text-zinc-300">
                  {rev.status}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Kararlar</p>
                <ul className="space-y-2">
                  {(rev.organizerId === dbUser.id
                    ? rev.decisions
                    : rev.decisions.filter((d) => d.assigneeId === dbUser.id)
                  ).map((d) => (
                      <li
                        key={d.id}
                        className="text-sm text-zinc-300 border border-zinc-800 rounded-md px-3 py-2 bg-zinc-900/40"
                      >
                        <span className="text-zinc-500 text-xs block mb-1">
                          {d.assignee ? `Atanan: ${d.assignee.name}` : "Atanan yok"} · {d.status}
                        </span>
                        {d.decisionText}
                        {d.kpi && <span className="block text-xs text-blue-400 mt-1">KPI: {d.kpi.name}</span>}
                      </li>
                    ))}
                </ul>
                {rev.decisions.length === 0 && <p className="text-sm text-zinc-500">Bu review için karar yok.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
