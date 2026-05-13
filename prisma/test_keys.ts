import prisma from "../src/lib/prisma";

console.log(Object.keys(prisma));

void prisma.$disconnect();
