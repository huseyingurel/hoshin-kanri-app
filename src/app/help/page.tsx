import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

// Basit statik notlar – ihtiyaca göre genişletilebilir
const NOTES = [
  { title: "Hoshin Kanri Nedir?", content: "Stratejik yönetim metodolojisi, hedefleri organizasyonun tüm seviyelerine hizalar." },
  { title: "RAG Nedir?", content: "Retrieval‑Augmented Generation – dış veri kaynaklarından bilgi alıp LLM ile birleştirerek üretim yapan yaklaşım." },
  { title: "X‑Matrix", content: "Strateji ağı, hedefler, KPI'lar, aksiyon planları ve sorumlu departmanları bir arada gösteren görsel matris." },
  { title: "KPI Kırmızı Alarmları", content: "Gerçekleşen değer, hedefi %10'dan fazla aştığında kırmızı renkyle işaretlenir ve otomatik aksiyon (countermeasure) oluşturulur." },
  { title: "Karar Yönetimi", content: "Değerlendirme oturumlarında alınan kararlar, sorumlu kişi ve departmanı ile birlikte saklanır." },
  // ek notlar gerektiğinde buraya eklenebilir
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const filtered = NOTES.filter((n) =>
    n.title.toLowerCase().includes(query.toLowerCase()) ||
    n.content.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-zinc-200">Hoshin Kanri Notlar</h1>
      <div className="relative w-full max-w-md">
        <Input
          placeholder="Not ara..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200"
        />
        <Search className="absolute left-3 top-2.5 size-4 text-zinc-500" />
      </div>
      <div className="grid gap-4">
        {filtered.map((note, idx) => (
          <Card key={idx} className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-xl text-zinc-100">{note.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-zinc-300">{note.content}</CardDescription>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-zinc-500 italic">Aramanıza uygun bir not bulunamadı.</p>
        )}
      </div>
    </div>
  );
}
