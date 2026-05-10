import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const hoshinCount = await prisma.hoshin.count();
  const taskCount = await prisma.majorTask.count();
  const kpiCount = await prisma.kPI.count();
  const deptCount = await prisma.department.count();

  console.log("📊 Veritabanı İstatistikleri:");
  console.log(`- Hoshin Sayısı: ${hoshinCount}`);
  console.log(`- Ana Görev Sayısı: ${taskCount}`);
  console.log(`- KPI Sayısı: ${kpiCount}`);
  console.log(`- Departman Sayısı: ${deptCount}`);
  
  if (hoshinCount > 0) {
    const latestHoshin = await prisma.hoshin.findFirst({ orderBy: { createdAt: 'desc' } });
    console.log(`- Son eklenen Hoshin: ${latestHoshin?.title}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
