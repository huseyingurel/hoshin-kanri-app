import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'huseyin.gurel@gmail.com' },
    update: {
      password: 'yitkasAs232323',
      name: 'Hüseyin Gürel',
      role: 'ADMIN'
    },
    create: {
      email: 'huseyin.gurel@gmail.com',
      password: 'yitkasAs232323',
      name: 'Hüseyin Gürel',
      role: 'ADMIN'
    }
  });

  console.log(`✅ Kullanıcı oluşturuldu/güncellendi: ${user.email}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
