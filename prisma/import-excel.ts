import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Veri aktarımı başlatılıyor...");
  const url = 'https://docs.google.com/spreadsheets/d/1Ld72zxGyRBm-5w_B7H0WOYJoDT8REpzERUhWZW8h5LE/export?format=xlsx';
  
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const workbook = xlsx.read(buffer, { type: 'buffer' });

  // 1. Hoshin Başlıklarını ve Açıklamalarını Çek
  const mainSheet = workbook.Sheets['Hoshin ana başlıkları'];
  const mainData: any[] = xlsx.utils.sheet_to_json(mainSheet);
  const hoshinMap = new Map<string, string>(); // Kod -> Açıklama (Mantık)
  
  mainData.forEach(row => {
    const code = row['Kod'];
    const reason = row['Neden AISIN Türkiye için mantıklı'];
    if (code && reason) hoshinMap.set(code, reason);
  });

  // 2. Veri Setini İşle
  const dataSheet = workbook.Sheets['Hoshin veri seti'];
  const dataRows: any[] = xlsx.utils.sheet_to_json(dataSheet);

  console.log(`📦 ${dataRows.length} satır veri işleniyor...`);

  for (const row of dataRows) {
    const hoshinTitleFull = row['Hoshin'] as string; // "H1 – OEM müşteri kalite mükemmelliği"
    const majorTaskTitle = row['Major Tasks'] as string;
    const actionPlanTitle = row['Action Plan'] as string;
    const kpiName = row['KPI'] as string;
    const deptNames = (row['Resp. Dept.'] as string || 'Genel').split('+').map(s => s.trim());
    const targetStr = row['FY2026 Target'] as string || '0';
    const freq = row['Reporting Frequency'] as string || 'Monthly';

    // Kod ayıklama (H1, H2 vb)
    const hoshinCode = hoshinTitleFull.split('–')[0].trim();
    const hoshinDescription = hoshinMap.get(hoshinCode) || "";

    // Departmanları oluştur/bul
    const depts = await Promise.all(deptNames.map(async name => {
      return await prisma.department.upsert({
        where: { name_unique: name }, // Hata almamak için prisma schema'da unique constraint olmalı veya findFirst kullanmalı. 
        // Mevcut şemada unique değilse findFirst kullanacağız.
        update: {},
        create: { name }
      }).catch(async () => {
         // Eğer upsert hata verirse (unique değilse) findFirst + create
         let d = await prisma.department.findFirst({ where: { name } });
         if (!d) d = await prisma.department.create({ data: { name } });
         return d;
      });
    }));

    // Hoshin oluştur/bul
    const hoshin = await prisma.hoshin.upsert({
      where: { title_year_unique: { title: hoshinTitleFull, year: 2026 } },
      update: {},
      create: {
        title: hoshinTitleFull,
        description: hoshinDescription,
        year: 2026,
        type: 'ANNUAL',
        status: 'ACTIVE'
      }
    }).catch(async () => {
        let h = await prisma.hoshin.findFirst({ where: { title: hoshinTitleFull, year: 2026 } });
        if (!h) h = await prisma.hoshin.create({ data: { title: hoshinTitleFull, year: 2026, type: 'ANNUAL', status: 'ACTIVE', description: hoshinDescription } });
        return h;
    });

    // Major Task oluştur
    const majorTask = await prisma.majorTask.create({
      data: {
        title: majorTaskTitle,
        hoshinId: hoshin.id,
        priority: 'MEDIUM',
        status: 'ACTIVE'
      }
    });

    // Action Plan oluştur
    const actionPlan = await prisma.actionPlan.create({
      data: {
        title: actionPlanTitle,
        majorTaskId: majorTask.id,
        responsibleDeptId: depts[0].id,
        status: 'IN_PROGRESS',
        progressPercent: 0
      }
    });

    // KPI Hedef ve Birim Ayrıştırma (Örn: "≤ 15 PPM" -> 15, "PPM")
    let targetValue = 0;
    let unit = "Adet";
    const targetText = String(targetStr);
    const match = targetText.match(/(\d+([.,]\d+)?)/);
    if (match) {
      targetValue = parseFloat(match[1].replace(',', '.'));
      unit = targetText.replace(match[0], '').replace(/[≤≥%]/g, '').trim() || "Adet";
      if (targetText.includes('%')) unit = "% " + unit;
    }

    // KPI oluştur
    await prisma.kPI.create({
      data: {
        name: kpiName,
        unit: unit,
        targetYear: targetValue,
        reportingFrequency: freq === 'Monthly' ? 'MONTHLY' : 'QUARTERLY',
        actionPlanId: actionPlan.id,
        responsibleDeptId: depts[0].id
      }
    });
  }

  console.log("✅ Veri aktarımı başarıyla tamamlandı!");
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
