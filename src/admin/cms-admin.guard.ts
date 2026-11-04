import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

@Injectable()
export class CmsAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { role?: string };
    }>();
    if (request.user?.role !== "ADMIN" && request.user?.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("This action requires an administrator");
    }
    return true;
  }
}
