import { PrismaClient } from "@prisma/client";
import { DataEntryClient } from "./DataEntryClient";
import { FileEdit } from "lucide-react";
import { getRagSettings } from "../actions/settingActions";

const prisma = new PrismaClient();

export default async function DataEntryPage() {
  const kpis = await prisma.kPI.findMany({
    select: {
      id: true,
      name: true,
      unit: true,
      targetYear: true,
    },
    orderBy: { name: 'asc' }
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
