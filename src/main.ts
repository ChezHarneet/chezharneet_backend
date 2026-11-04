import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: 5 * 1024 * 1024 }),
  );
  await app.register(helmet);
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1, parts: 1 },
  });
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configuredOrigins.includes("*")) {
    throw new Error("CORS_ORIGINS must list explicit origins; wildcard origins are not allowed");
  }
  const publicWebOrigin = process.env.WEB_URL?.trim()
    ? new URL(process.env.WEB_URL.trim()).origin
    : undefined;
  const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...configuredOrigins,
    ...(publicWebOrigin ? [publicWebOrigin] : []),
  ];
  await app.register(cors, {
    origin: [...new Set(allowedOrigins)],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "ngrok-skip-browser-warning"],
    maxAge: 600,
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}
bootstrap();
