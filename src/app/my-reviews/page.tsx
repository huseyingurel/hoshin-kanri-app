import { Users } from "lucide-react";

export default function MyReviewsPage() {
  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto h-full justify-center items-center opacity-70">
      <Users size={64} className="text-zinc-600 mb-4" />
      <h1 className="text-3xl font-bold tracking-tight text-zinc-300">Dönem Değerlendirmelerim</h1>
      <p className="text-zinc-500 max-w-lg text-center">
        Yöneticinizle yaptığınız 1-1 geri bildirimlerin (1-on-1 Feedback) ve geçmiş dönem RAG performans özetlerinizin listeleneceği şablon ekrandır. Faz 2 kapsamında geliştirilecektir.
      </p>
    </div>
  );
}
