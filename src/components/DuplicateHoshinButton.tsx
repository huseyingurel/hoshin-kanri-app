"use client";

/**
 * FR-04: bir Hoshin'i şablon olarak çoğaltma düğmesi. Yalnız kurum geneli roller görür.
 * Çoğaltma alt ağacı (ana görev / aksiyon planı / KPI) taslak olarak kopyalar; işletimsel
 * veriler alınmaz.
 */

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { duplicateHoshin } from "@/app/actions/strategyActions";

export function DuplicateHoshinButton({ hoshinId }: { hoshinId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await duplicateHoshin(hoshinId);
      if (!res.success) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        className="h-6 gap-1 text-[10px] border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
      >
        <Copy size={12} />
        {isPending ? "Çoğaltılıyor…" : "Şablondan Çoğalt"}
      </Button>
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  );
}
