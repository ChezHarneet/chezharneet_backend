import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

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

  async inviteAdmin(email: string, firstName: string, lastName: string, invitedById: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, isActive: true },
    });
    if (existingUser && !existingUser.isActive) {
      throw new ConflictException('This account is inactive and cannot be invited');
    }
    if (existingUser?.role === Role.ADMIN || existingUser?.role === Role.SUPER_ADMIN) {
      throw new ConflictException('This email already has administrator access');
    }

    const now = new Date();
    const pending = await this.db.adminInvite.findFirst({
      where: { email: normalizedEmail, acceptedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (pending) throw new ConflictException('An invitation is already pending for this email');

    const webUrl = process.env.WEB_URL?.trim();
    if (!webUrl && process.env.NODE_ENV === 'production') {
      throw new Error('WEB_URL must be configured to send administrator invitations');
    }
    const inviteUrl = new URL('/admin-invite', webUrl || 'http://localhost:3000');
    const token = randomBytes(32).toString('base64url');
    const invite = await this.db.adminInvite.create({
      data: {
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        tokenHash: createHash('sha256').update(token).digest('hex'),
        invitedById,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, firstName: true, expiresAt: true },
    });
    inviteUrl.searchParams.set('token', token);

    try {
      await this.notifications.emailAdminInvite(invite.email, invite.firstName, inviteUrl.toString());
    } catch (error) {
      await this.db.adminInvite.delete({ where: { id: invite.id } });
      throw error;
    }

    return { id: invite.id, email: invite.email, firstName: invite.firstName, status: 'INVITED', expiresAt: invite.expiresAt };
  }

  async acceptInvitation(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    return this.db.$transaction(async (transaction) => {
      const invite = await transaction.adminInvite.findUnique({ where: { tokenHash } });
      if (!invite || invite.expiresAt <= now) {
        throw new ForbiddenException('This invitation is invalid or has expired');
      }
      if (invite.acceptedAt) return { email: invite.email };

      const user = await transaction.user.findUnique({
        where: { email: invite.email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          emailVerifiedAt: true,
        },
      });
      if (user && !user.isActive) {
        throw new ForbiddenException('This account is inactive');
      }
      if (user && user.role !== Role.USER) {
        throw new ConflictException('This account already has administrator access');
      }

      const claimed = await transaction.adminInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) {
        throw new ForbiddenException('This invitation is invalid or has expired');
      }

      const account = user
        ? await transaction.user.update({
            where: { id: user.id },
            data: {
              role: Role.ADMIN,
              firstName: user.firstName ?? invite.firstName,
              lastName: user.lastName ?? invite.lastName,
              emailVerifiedAt: user.emailVerifiedAt ?? now,
            },
            select: { email: true },
          })
        : await transaction.user.create({
            data: {
              email: invite.email,
              firstName: invite.firstName,
              lastName: invite.lastName,
              role: Role.ADMIN,
              emailVerifiedAt: now,
            },
            select: { email: true },
          });
      return { email: account.email };
    });
  }
}
