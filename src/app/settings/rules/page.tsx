import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, AlertCircle, Settings2, Target } from "lucide-react";

export default function AutomationRulesPage() {
  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="text-blue-500" />
          RAG & Otomasyon Kuralları (Automation Rules)
        </h1>
        <p className="text-zinc-400 mt-2">Sistemin arka planda kullandığı performans değerlendirme formülleri ve otomatik Karşı Önlem (Countermeasure) tetikleyicileri.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator size={20} className="text-indigo-400" />
              Sapma Hesaplama (Variance Logic)
            </CardTitle>
            <CardDescription>KPI hedefleri ile gerçekleşen değerlerin karşılaştırma yöntemi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 font-mono text-sm">
              <span className="text-zinc-500">// Temel Formül:</span><br/>
              <span className="text-blue-400">let</span> variance = <span className="text-emerald-400">actualValue</span> - <span className="text-amber-400">targetValue</span>;
            </div>
            <p className="text-sm text-zinc-400">
              Şu anki MVP aşamasında, gerçekleşen değerin (actual) hedef değerden (target) büyük olması durumu bir sapma olarak kabul edilir. İlerleyen aşamalarda "Higher is better" (Yüksek olan iyidir) veya "Lower is better" (Düşük olan iyidir) şeklinde metrik tipleri eklenecektir.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target size={20} className="text-emerald-400" />
              Renk / Durum Kodları (RAG Status)
            </CardTitle>
            <CardDescription>Sapmaya göre atanan görsel uyarı sistemi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 font-mono text-sm">
              <span className="text-zinc-500">// Renk Mantığı:</span><br/>
              <span className="text-purple-400">if</span> (variance {'>'} <span className="text-amber-400">0</span>) {'{'} <br/>
              &nbsp;&nbsp;<span className="text-blue-400">return</span> <span className="text-rose-400">"RED"</span>; <span className="text-zinc-500">// Hedef Aşıldı (Kötü)</span><br/>
              {'}'} <span className="text-purple-400">else</span> {'{'} <br/>
              &nbsp;&nbsp;<span className="text-blue-400">return</span> <span className="text-emerald-400">"GREEN"</span>; <span className="text-zinc-500">// Hedef Altında / Eşit (İyi)</span><br/>
              {'}'}
            </div>
            <p className="text-sm text-zinc-400">
              Bu durum her Veri Girişi (Data Entry) sırasında Server Action üzerinden sunucuda hesaplanır ve veritabanına <code className="bg-zinc-800 px-1 rounded text-zinc-300">statusColor</code> olarak işlenir.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800 md:col-span-2 border-l-4 border-l-rose-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle size={20} className="text-rose-500" />
              Otomatik Countermeasure (A3) Tetikleyicisi
            </CardTitle>
            <CardDescription>Kırmızı KPI'larda sistemin aldığı otonom aksiyon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-300 mb-4">
              Veritabanına kaydedilen yeni bir dönem verisinin (Period Record) durumu <Badge variant="destructive" className="mx-1">RED</Badge> olarak sonuçlanırsa, sistem <strong>kök neden analizi (root cause analysis)</strong> yapılabilmesi için otomatik olarak bir "Açık Karşı Önlem" (Open Countermeasure) kaydı oluşturur.
            </p>
            <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 font-mono text-sm">
              <span className="text-zinc-500">// Otomasyon Kodu:</span><br/>
              <span className="text-purple-400">if</span> (statusColor === <span className="text-rose-400">"RED"</span>) {'{'}<br/>
              &nbsp;&nbsp;<span className="text-blue-400">await</span> prisma.countermeasure.<span className="text-yellow-200">create</span>({'{'}<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;data: {'{'}<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;kpiId,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;problemStatement: <span className="text-emerald-300">"Veri girişi sırasında otomatik oluşturuldu: Gerçekleşen değer hedeften saptı."</span>,<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;status: <span className="text-emerald-300">"OPEN"</span><br/>
              &nbsp;&nbsp;&nbsp;&nbsp;{'}'}<br/>
              &nbsp;&nbsp;{'}'});<br/>
              {'}'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
