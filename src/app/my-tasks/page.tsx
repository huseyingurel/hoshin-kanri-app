import { CheckSquare } from "lucide-react";
import { getMyTasks } from "../actions/taskActions";
import { MyTasksClient } from "./MyTasksClient";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  // getMyTasks oturum + kapsam kontrolünü (INV-4) kendi içinde yapar.
  const tasks = await getMyTasks();

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CheckSquare className="text-blue-500" />
          Benim Görevlerim
        </h1>
        <p className="text-zinc-400 mt-2">
          Sistem (dönem girişi, vade, kırmızı KPI, eskalasyon) ve elle oluşturulan görevleriniz.
        </p>
      </div>

      <MyTasksClient tasks={tasks as never} />
    </div>
  );
}
