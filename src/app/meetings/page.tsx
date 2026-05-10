import { getReviews, getReviewAgendaItems } from "../actions/reviewActions";
import { PrismaClient } from "@prisma/client";
import { ReviewClient } from "./ReviewClient";
import { Users } from "lucide-react";

const prisma = new PrismaClient();

export default async function MeetingsPage() {
  const reviews = await getReviews();
  const { activeRedKpis, openCountermeasures } = await getReviewAgendaItems();
  
  // Karar atamaları için tüm kullanıcıları getir
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' }
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-zinc-200">
          <Users className="text-blue-500" />
          Değerlendirme Merkezi
        </h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">
          Sistemin, kırmızı KPI'lar ve açık aksiyonlar üzerinden otomatik toplantı/inceleme gündemi oluşturduğu ve kararların direkt aksiyona dönüştürüldüğü Değerlendirme Modülü.
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
