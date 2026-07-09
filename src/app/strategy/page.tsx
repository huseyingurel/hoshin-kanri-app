import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Layers, FileText, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessionOrRedirect } from "@/lib/session";
import { hoshinScopeFilter, type UserScope } from "@/lib/dataScope";
import { isOrgWideRole } from "@/lib/access";
import { redirect } from "next/navigation";
import { CatchballThread } from "@/components/CatchballThread";
import { LifecycleStatusSelect } from "@/components/LifecycleStatusSelect";
import { DuplicateHoshinButton } from "@/components/DuplicateHoshinButton";

export const dynamic = "force-dynamic";

export default async function StrategyTree() {
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
  const hWhere = hoshinScopeFilter(scope);
  const orgWide = isOrgWideRole(session.role);

  const hoshins = await prisma.hoshin.findMany({
    ...(hWhere ? { where: hWhere } : {}),
    include: {
      vision: { select: { id: true, statement: true, year: true, status: true } },
      majorTasks: {
        include: {
          actionPlans: {
            include: {
              kpis: true,
              responsibleDept: true,
            },
          },
        },
      },
    },
  });

  // Catchball: bu hoshinlere ait konuşma geçmişi (tek sorgu) + karşı taraf seçenekleri.
  const hoshinIds = hoshins.map((h) => h.id);
  const catchballItems = hoshinIds.length
    ? await prisma.catchballItem.findMany({
        where: { entityType: "HOSHIN", entityId: { in: hoshinIds } },
        orderBy: { createdAt: "asc" },
        include: {
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
        },
      })
    : [];
  const threadByHoshin = new Map<string, typeof catchballItems>();
  for (const it of catchballItems) {
    const arr = threadByHoshin.get(it.entityId) ?? [];
    arr.push(it);
    threadByHoshin.set(it.entityId, arr);
  }

  const userOrderBy = { name: "asc" as const };
  const counterpartyUsers = orgWide
    ? await prisma.user.findMany({ orderBy: userOrderBy, select: { id: true, name: true } })
    : scope.departmentId
      ? await prisma.user.findMany({
          where: { departmentId: scope.departmentId },
          orderBy: userOrderBy,
          select: { id: true, name: true },
        })
      : await prisma.user.findMany({
          where: { id: scope.id },
          orderBy: userOrderBy,
          select: { id: true, name: true },
        });

  // FR-09: departman seçenekleri (tüm kullanıcılar departmanları görebilir).
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // FR-01: hoshins'i vizyona göre grupla; vizyon atanmamışları ayrı tut.
  const visionMap = new Map<string, { vision: NonNullable<(typeof hoshins)[0]["vision"]>; items: typeof hoshins }>();
  const unassigned: typeof hoshins = [];

  for (const h of hoshins) {
    if (h.vision) {
      const grp = visionMap.get(h.vision.id) ?? { vision: h.vision, items: [] };
      grp.items.push(h);
      visionMap.set(h.vision.id, grp);
    } else {
      unassigned.push(h);
    }
  }

  const visionGroups = [...visionMap.values()];

  // Tüm grupları birleştir (vizyon grupları + atanmamışlar)
  const allGroups: Array<{
    label: string;
    sublabel?: string;
    status?: string;
    isVision: boolean;
    items: typeof hoshins;
  }> = [
    ...visionGroups.map((g) => ({
      label: g.vision.statement,
      sublabel: `${g.vision.year} · True North`,
      status: g.vision.status,
      isVision: true,
      items: g.items,
    })),
    ...(unassigned.length > 0
      ? [{ label: "Atanmamış", sublabel: "Vizyon bağlantısı olmayan hoshinler", isVision: false, items: unassigned }]
      : []),
  ];

  const VISION_STATUS_LABELS: Record<string, string> = {
    DRAFT: "Taslak",
    ACTIVE: "Aktif",
    ARCHIVED: "Arşiv",
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Target className="text-emerald-500" />
          Strategy Tree (Hoshin Yayılımı)
        </h1>
        <p className="text-zinc-400 mt-2">
          {orgWide
            ? "Vizyondan aksiyonlara uzanan strateji haritası"
            : "Yalnızca sorumluluğunuzda olan aksiyon planları ve KPI bağlantılarını gösterir."}
        </p>
      </div>

      {allGroups.length === 0 && (
        <p className="text-zinc-500 text-sm">Kapsamınızda hoshin bulunamadı.</p>
      )}

      {allGroups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-4">
          {/* FR-01: Vizyon / True North başlığı */}
          <div className="flex items-center gap-3 pb-2 border-b border-zinc-800">
            {group.isVision ? (
              <Eye className="text-violet-400" size={20} />
            ) : (
              <Target className="text-zinc-500" size={20} />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${group.isVision ? "text-violet-200" : "text-zinc-400"}`}>
                  {group.label}
                </span>
                {group.sublabel && (
                  <span className="text-xs text-zinc-500">{group.sublabel}</span>
                )}
              </div>
            </div>
            {group.status && group.isVision && (
              <Badge variant="outline" className="text-violet-400 border-violet-400/20 bg-violet-400/10 text-[10px]">
                {VISION_STATUS_LABELS[group.status] ?? group.status}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-8">
            {group.items.map((hoshin) => (
              <Card key={hoshin.id} className="bg-zinc-950 border-zinc-800 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-zinc-900 to-zinc-950 border-b border-zinc-800 p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className="mb-2 text-emerald-400 border-emerald-400/20 bg-emerald-400/10">
                        {hoshin.type} - {hoshin.year}
                      </Badge>
                      <h2 className="text-2xl font-bold text-white">{hoshin.title}</h2>
                      <p className="text-zinc-400 mt-1 max-w-2xl">{hoshin.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {/* FR-06: Hoshin durum seçici */}
                      <LifecycleStatusSelect
                        entityType="HOSHIN"
                        entityId={hoshin.id}
                        currentStatus={hoshin.status}
                        canEdit={orgWide}
                      />
                      {/* FR-04: şablondan çoğaltma (yalnız kurum geneli roller) */}
                      {orgWide && <DuplicateHoshinButton hoshinId={hoshin.id} />}
                    </div>
                  </div>
                </div>

                <CardContent className="p-0">
                  <div className="divide-y divide-zinc-800/50">
                    {hoshin.majorTasks.map((task) => (
                      <div key={task.id} className="p-6 bg-zinc-950/50 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <Layers className="text-blue-500" size={20} />
                          <h3 className="text-lg font-semibold text-zinc-200">{task.title}</h3>
                          <Badge variant="outline" className="ml-auto bg-zinc-900">{task.priority} PRIORITY</Badge>
                          {/* FR-06: MajorTask durum seçici */}
                          <LifecycleStatusSelect
                            entityType="MAJOR_TASK"
                            entityId={task.id}
                            currentStatus={task.status}
                            canEdit={orgWide}
                          />
                        </div>

                        <div className="ml-8 pl-6 border-l-2 border-zinc-800 flex flex-col gap-4">
                          {task.actionPlans.map((action) => (
                            <div key={action.id} className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="text-amber-500" size={16} />
                                  <h4 className="font-medium text-zinc-300">{action.title}</h4>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded">
                                    {action.responsibleDept?.name || "Atanmadı"}
                                  </div>
                                  {/* FR-06: ActionPlan durum seçici */}
                                  <LifecycleStatusSelect
                                    entityType="ACTION_PLAN"
                                    entityId={action.id}
                                    currentStatus={action.status}
                                    canEdit={orgWide || action.ownerUserId === dbUser.id}
                                  />
                                </div>
                              </div>
                              <p className="text-sm text-zinc-500 mb-3">{action.description}</p>

                              {action.kpis.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-zinc-800/50">
                                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2 font-semibold">İlişkili KPI'lar</div>
                                  <div className="flex flex-wrap gap-2">
                                    {action.kpis.map(kpi => (
                                      <Badge key={kpi.id} variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex gap-1 items-center">
                                        <Target size={12} className="text-emerald-500" />
                                        {kpi.name}
                                        <span className="text-zinc-500 ml-1">({kpi.targetYear}{kpi.unit})</span>
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 pt-2">
                    <CatchballThread
                      entityType="HOSHIN"
                      entityId={hoshin.id}
                      status={hoshin.catchballStatus}
                      items={threadByHoshin.get(hoshin.id) ?? []}
                      users={counterpartyUsers}
                      departments={departments}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
