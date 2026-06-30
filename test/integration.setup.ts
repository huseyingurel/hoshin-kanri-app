import { afterAll, beforeEach } from "vitest";
import prisma from "@/lib/prisma";

/**
 * Her testten önce tüm tabloları temizle (izole, deterministik durum). Tablo listesi
 * şemadan bağımsız olsun diye `pg_tables`'tan okunur; yeni model eklemek bu dosyayı
 * güncellemeyi gerektirmez. TRUNCATE … CASCADE FK'leri de temizler.
 */
beforeEach(async () => {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const quoted = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (quoted.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
