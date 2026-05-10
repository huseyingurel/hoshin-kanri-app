import { PrismaClient } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, AlertCircle, Calendar, Clock } from "lucide-react";

const prisma = new PrismaClient();

export default async function MyTasksPage() {
  const countermeasures = await prisma.countermeasure.findMany({
    where: { status: 'OPEN' },
    include: { kpi: true, ownerUser: true },
    orderBy: { createdAt: 'desc' }
  });

  const actionPlans = await prisma.actionPlan.findMany({
    where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    include: { majorTask: true, responsibleDept: true },
    orderBy: { dueDate: 'asc' }
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CheckSquare className="text-blue-500" />
          Benim Görevlerim
        </h1>
        <p className="text-zinc-400 mt-2">Üzerinize atanan aksiyon planları ve açık karşı önlemler (A3).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Aksiyon Planları */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-200">
            <Clock className="text-indigo-400" size={20} /> Bekleyen Aksiyon Planları
          </h2>
          {actionPlans.map(plan => (
            <Card key={plan.id} className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                    {plan.status === 'IN_PROGRESS' ? 'Devam Ediyor' : 'Başlamadı'}
                  </Badge>
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <Calendar size={12} /> {plan.dueDate ? new Date(plan.dueDate).toLocaleDateString('tr-TR') : '-'}
                  </span>
                </div>
                <CardTitle className="text-base mt-2">{plan.title}</CardTitle>
                <CardDescription className="text-xs">Bağlı Olduğu İş: {plan.majorTask.title}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">{plan.description}</p>
                <div className="mt-4 bg-zinc-900 rounded-full h-2 w-full overflow-hidden">
                  <div className="bg-indigo-500 h-full" style={{ width: `${plan.progressPercent}%` }} />
                </div>
                <div className="text-right text-xs text-zinc-500 mt-1">% {plan.progressPercent} Tamamlandı</div>
              </CardContent>
            </Card>
          ))}
          {actionPlans.length === 0 && <p className="text-zinc-500 text-sm">Bekleyen aksiyon planınız bulunmuyor.</p>}
        </div>

        {/* Countermeasures */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-200">
            <AlertCircle className="text-amber-500" size={20} /> Açık Karşı Önlemler (A3)
          </h2>
          {countermeasures.map(cm => (
            <Card key={cm.id} className="bg-zinc-950 border-amber-500/30">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge className="bg-amber-500 hover:bg-amber-600">Açık Karşı Önlem</Badge>
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <Calendar size={12} /> {cm.dueDate ? new Date(cm.dueDate).toLocaleDateString('tr-TR') : '-'}
                  </span>
                </div>
                <CardTitle className="text-base mt-2">{cm.problemStatement}</CardTitle>
                <CardDescription className="text-xs text-rose-400">Sapan KPI: {cm.kpi?.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-zinc-900/50 p-3 rounded text-sm text-zinc-400 border border-zinc-800">
                  <strong className="text-zinc-300 block mb-1">Kök Neden:</strong>
                  {cm.rootCause || "Kök neden bekleniyor..."}
                </div>
              </CardContent>
            </Card>
          ))}
          {countermeasures.length === 0 && <p className="text-zinc-500 text-sm">Açık karşı önleminiz bulunmuyor.</p>}
        </div>
      </div>
    </div>
  );
}
