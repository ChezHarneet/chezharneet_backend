import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';

const email = process.env.PROVISION_ADMIN_EMAIL?.trim().toLowerCase();
const requestedRole = process.env.PROVISION_ADMIN_ROLE?.trim().toUpperCase();

if (!email || !requestedRole || ![Role.ADMIN, Role.SUPER_ADMIN].includes(requestedRole as Role)) {
  console.error('Set PROVISION_ADMIN_EMAIL and PROVISION_ADMIN_ROLE=ADMIN or SUPER_ADMIN.');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !existing.isActive) {
    throw new Error('The selected account is inactive. Reactivate it through an authorized database operation first.');
  }
  const account = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: requestedRole as Role } })
    : await prisma.user.create({
        data: {
          email,
          role: requestedRole as Role,
          emailVerifiedAt: new Date(),
        },
      });
  console.log(`Provisioned ${account.email} as ${account.role}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Admin provisioning failed.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
