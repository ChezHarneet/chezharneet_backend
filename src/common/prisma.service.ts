import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (!this.isRetryableConnectionError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database connection unavailable (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private isRetryableConnectionError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "errorCode" in error &&
      (error.errorCode === "P1001" || error.errorCode === "P1002")
    );
  }
}
