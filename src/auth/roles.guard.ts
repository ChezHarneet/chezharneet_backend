import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(PrismaService)
    private readonly db: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { sub?: string; role?: Role; email?: string };
    }>();
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('Authentication required');

    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, email: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Account is unavailable');
    if (request.user) {
      request.user.role = user.role;
      request.user.email = user.email;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
    return true;
  }
}
