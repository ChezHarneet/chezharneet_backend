import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./common/prisma.service";
import { RedisService } from "./common/redis.service";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { NotificationService } from "./notifications/notification.service";
import { CourseController } from "./courses/course.controller";
import { CourseService } from "./courses/course.service";
import { OrderController } from "./orders/order.controller";
import { OrderService } from "./orders/order.service";
import { ProgressController } from "./progress/progress.controller";
import { ProgressService } from "./progress/progress.service";
import { AuthGuard } from "./auth/auth.guard";
import { CmsController } from "./admin/cms.controller";
import { CmsService } from "./admin/cms.service";
import { CmsAdminGuard } from "./admin/cms-admin.guard";
import { OptionalAuthGuard } from "./auth/optional-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { AdminUsersController } from "./admin/admin-users.controller";
import { AdminUsersService } from "./admin/admin-users.service";
import { SpeakingCmsController } from "./admin/speaking-cms.controller";
import { SpeakingCmsService } from "./admin/speaking-cms.service";

@Module({ 
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_ACCESS_SECRET") ?? config.get<string>("JWT_SECRET");
        if (!secret && process.env.NODE_ENV === "production") {
          throw new Error("JWT_SECRET or JWT_ACCESS_SECRET must be configured in production");
        }
        return { secret: secret ?? "development-jwt-secret" };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    CourseController,
    OrderController,
    ProgressController,
    CmsController,
    SpeakingCmsController,
    AdminUsersController,
  ],
  providers: [
    PrismaService,
    RedisService,
    AuthService,
    NotificationService,
    CourseService,
    OrderService,
    ProgressService,
    AuthGuard,
    RolesGuard,
    CmsAdminGuard,
    OptionalAuthGuard,
    CmsService,
    AdminUsersService,
    SpeakingCmsService,
  ],
})
export class AppModule {}
