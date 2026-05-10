import { PrismaClient } from "@prisma/client";
import { AlertCircle } from "lucide-react";
import { CountermeasureClient } from "./CountermeasureClient";

const prisma = new PrismaClient();

export default async function Countermeasures() {
  const countermeasures = await prisma.countermeasure.findMany({
    include: {
      kpi: true,
      ownerUser: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
          <AlertCircle className="text-amber-500" />
          Karşı Önlemler (Countermeasures / A3)
        </h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          Kırmızı (Sapan) KPI'lar için alınan aksiyonlar ve kök neden analizleri. Veri girişi sırasında kırmızıya düşen KPI'lar buraya otomatik olarak düşer. Yöneticilerin bu taslakları doldurup "Kaydet" ve ardından "Kapat" butonlarıyla süreci yönetmesi beklenir.
        </p>
      </div>

      <CountermeasureClient countermeasures={countermeasures} />
    </div>
  );
}
