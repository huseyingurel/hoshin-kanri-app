import prisma from "../src/lib/prisma";

async function main() {
  const hoshins = await prisma.hoshin.findMany({
    include: { _count: { select: { majorTasks: true } } }
  });
  
  console.log("🔍 Veritabanı Detaylı Kontrol:");
  console.log(`Toplam Hoshin Sayısı: ${hoshins.length}`);
  
  hoshins.forEach(h => {
    console.log(`- [${h.id}] ${h.title} (${h.year}) - Görev Sayısı: ${h._count.majorTasks}`);
  });

  const users = await prisma.user.findMany();
  console.log(`\nToplam Kullanıcı Sayısı: ${users.length}`);
  users.forEach(u => {
    console.log(`- ${u.email} (ID: ${u.id})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
