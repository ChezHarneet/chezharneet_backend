import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NotificationsWorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    NotificationsWorkerModule,
  );
  app.enableShutdownHooks();
}

void bootstrap();
