import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(PrismaService)
    private readonly db: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { sub: string; email?: string; role?: Role };
    }>();
    const authorization = request.headers.authorization ?? '';
    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!this.jwt || typeof this.jwt.verifyAsync !== 'function') {
      this.logger.error('JWT service was not injected into AuthGuard');
      throw new InternalServerErrorException('Authentication service is unavailable');
    }

    let claims: { sub: string; email?: string };
    try {
      claims = await this.jwt.verifyAsync<{ sub: string; email?: string }>(authorization.slice(7));
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown verification failure';
      this.logger.warn(`JWT verification rejected (${reason})`);
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw new UnauthorizedException('Invalid access token');
    }
    const account = await this.db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Account is unavailable');
    }
    request.user = { sub: account.id, email: account.email, role: account.role };
    return true;
  }
}
