import { PrismaClient } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Target, ArrowRight, Layers, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

export default async function StrategyTree() {
  const hoshins = await prisma.hoshin.findMany({
    include: {
      majorTasks: {
        include: {
          actionPlans: {
            include: {
              kpis: true,
              responsibleDept: true,
            }
          }
        }
      }
    }
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Target className="text-emerald-500" />
          Strategy Tree (Hoshin Yayılımı)
        </h1>
        <p className="text-zinc-400 mt-2">Vizyondan aksiyonlara uzanan strateji haritası</p>
      </div>

      <div className="flex flex-col gap-8">
        {hoshins.map((hoshin) => (
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
                <Badge variant="secondary">{hoshin.status}</Badge>
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
                    </div>
                    
                    <div className="ml-8 pl-6 border-l-2 border-zinc-800 flex flex-col gap-4">
                      {task.actionPlans.map((action) => (
                        <div key={action.id} className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="text-amber-500" size={16} />
                              <h4 className="font-medium text-zinc-300">{action.title}</h4>
                            </div>
                            <div className="text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded">
                              {action.responsibleDept?.name || "Atanmadı"}
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
