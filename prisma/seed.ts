import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding data...');

  // 1. Create Departments
  const deptHR = await prisma.department.create({
    data: { name: 'İnsan Kaynakları', description: 'İnsan Kaynakları Departmanı' },
  });
  const deptProd = await prisma.department.create({
    data: { name: 'Üretim', description: 'Üretim Departmanı' },
  });
  const deptSales = await prisma.department.create({
    data: { name: 'Satış & Pazarlama', description: 'Satış Departmanı' },
  });

  // 2. Create Users
  const userAdmin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@hoshinkanri.com',
      role: 'ADMIN',
    },
  });
  const userPMO = await prisma.user.create({
    data: {
      name: 'Strateji Direktörü',
      email: 'pmo@hoshinkanri.com',
      role: 'PMO',
    },
  });
  const userProdManager = await prisma.user.create({
    data: {
      name: 'Üretim Müdürü',
      email: 'uretim@hoshinkanri.com',
      role: 'DEPT_HEAD',
      departmentId: deptProd.id,
    },
  });

  // 3. Create Hoshin
  const hoshin1 = await prisma.hoshin.create({
    data: {
      title: 'Kârlı Büyüme ve Operasyonel Mükemmellik (2025)',
      description: 'Maliyetleri düşürürken pazar payını artırmak.',
      year: 2025,
      type: 'BREAKTHROUGH',
      status: 'ACTIVE',
      sponsorUserId: userPMO.id,
    },
  });

  // 4. Create Major Task
  const majorTask1 = await prisma.majorTask.create({
    data: {
      title: 'Üretim Fire Oranını %5\'in Altına İndirmek',
      description: 'Kalite kontrol süreçlerini sıkılaştırarak fireleri azaltmak.',
      priority: 'HIGH',
      status: 'ACTIVE',
      hoshinId: hoshin1.id,
    },
  });

  // 5. Create Action Plan
  const actionPlan1 = await prisma.actionPlan.create({
    data: {
      title: 'Yeni Kalite Kontrol Sensörlerinin Entegrasyonu',
      description: 'Hat 1 ve Hat 2 için otomatik sensörlerin alınması ve kurulması.',
      startDate: new Date('2025-01-01'),
      dueDate: new Date('2025-06-30'),
      progressPercent: 40,
      status: 'IN_PROGRESS',
      majorTaskId: majorTask1.id,
      ownerUserId: userProdManager.id,
      responsibleDeptId: deptProd.id,
    },
  });

  // 6. Create KPI
  const kpi1 = await prisma.kPI.create({
    data: {
      name: 'Aylık Fire Oranı',
      definition: 'Hatalı ürün sayısının toplam üretime oranı',
      unit: '%',
      targetYear: 5,
      reportingFrequency: 'MONTHLY',
      actionPlanId: actionPlan1.id,
      ownerUserId: userProdManager.id,
      responsibleDeptId: deptProd.id,
    },
  });

  // 7. Create KPI Period Records
  // Nisan, Mayıs için veri ekleyelim.
  await prisma.kPIPeriodRecord.create({
    data: {
      kpiId: kpi1.id,
      periodStart: new Date('2025-04-01'),
      periodEnd: new Date('2025-04-30'),
      targetValue: 5,
      actualValue: 4.8,
      variance: -0.2,
      statusColor: 'GREEN',
      ownerComment: 'Süreç beklendiği gibi işliyor.',
      submittedById: userProdManager.id,
      submittedAt: new Date('2025-05-02'),
    },
  });

  await prisma.kPIPeriodRecord.create({
    data: {
      kpiId: kpi1.id,
      periodStart: new Date('2025-05-01'),
      periodEnd: new Date('2025-05-31'),
      targetValue: 5,
      actualValue: 6.2,
      variance: 1.2,
      statusColor: 'RED',
      ownerComment: 'Sensör 2 arızalandı, manuel kontrole geçildi.',
      submittedById: userProdManager.id,
      submittedAt: new Date('2025-06-03'),
    },
  });

  // 8. Create Countermeasure for the RED record
  await prisma.countermeasure.create({
    data: {
      kpiId: kpi1.id,
      problemStatement: 'Sensör 2 arızası nedeniyle mayıs ayında fire oranı hedefin üzerine çıktı.',
      rootCause: 'Sensör kalibrasyonunda yaşanan teknik hata.',
      actionSummary: 'Tedarikçi firma ile acil servis bakımı planlandı.',
      ownerUserId: userProdManager.id,
      dueDate: new Date('2025-06-15'),
      status: 'OPEN',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
