import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma.service";
import { getJwtSecret } from "./jwt-secret";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(PrismaService)
    private readonly db: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { sub: string; email: string; role: string };
    }>();
    const authorization = request.headers.authorization;
    if (!authorization) return true;
    if (!authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid authorization header");
    }

    let user: { sub: string; email: string; role: string };
    try {
      user = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(authorization.slice(7), { secret: getJwtSecret() });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (!user.sub) throw new UnauthorizedException("Invalid access token");
    const account = await this.db.user.findUnique({
      where: { id: user.sub },
      select: { id: true, isActive: true, role: true, email: true },
    });
    if (!account?.isActive) {
      throw new UnauthorizedException("Account is unavailable");
    }
    request.user = {
      sub: account.id,
      email: account.email,
      role: account.role,
    };
    return true;
  }
}
