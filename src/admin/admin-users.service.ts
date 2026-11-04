import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AdminUsersService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  list() {
    return this.db.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async updateRole(userId: string, role: Role) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
      const superAdminCount = await this.db.user.count({ where: { role: Role.SUPER_ADMIN, isActive: true } });
      if (superAdminCount <= 1) {
        throw new ConflictException('The last active super administrator cannot be demoted');
      }
    }
    return this.db.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    });
  }
}
