import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";
import { encryptOtp, assertOtpEmailEncryptionKey } from "./otp-email-crypto";

@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private queue?: Queue;

  constructor(
    @Inject(RedisService)
    private readonly redis: Pick<RedisService, "client">,
    @Inject(PrismaService)
    private readonly prisma: Pick<PrismaService, "notificationLog">,
  ) {}

  private getQueue(): Queue {
    if (!this.queue) {
      const queue = new Queue("notifications", {
        connection: this.redis.client,
      });
      queue.on("ioredis:close", () => {
        if (this.queue !== queue) return;
        this.queue = undefined;
        void queue.close().catch(() => undefined);
      });
      this.queue = queue;
    }
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async emailOtp(to: string, code: string, otpId?: string) {
    const encryptedCode = encryptOtp(code);
    return this.getQueue().add(
      "email.otp",
      { to, encryptedCode },
      {
        ...(otpId ? { jobId: `otp-${otpId}` } : {}),
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  async sendOtpEmail(to: string, code: string, otpId: string) {
    const logId = `otp-${otpId}`;
    const existing = await this.prisma.notificationLog.findUnique({
      where: { id: logId },
      select: { status: true, providerMessageId: true, sentAt: true },
    });
    if (existing?.status === "SENT") {
      return {
        id: logId,
        messageId: existing.providerMessageId,
        acceptedAt: existing.sentAt,
        alreadySent: true,
      };
    }
    if (existing?.status === "QUEUED") {
      throw new ServiceUnavailableException("Verification email delivery is already in progress");
    }

    await this.prisma.notificationLog.upsert({
      where: { id: logId },
      update: {
        channel: "EMAIL",
        event: "otp",
        destination: to,
        status: "QUEUED",
        error: null,
        payload: { otpId },
      },
      create: {
        id: logId,
        channel: "EMAIL",
        event: "otp",
        destination: to,
        status: "QUEUED",
        payload: { otpId },
      },
    });

    const messageId = `otp-${otpId}@${this.messageIdDomain()}`;
    let accepted: { messageId?: string; response?: string } | undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let transport: Transporter | undefined;
      try {
        transport = this.createOtpTransport();
        accepted = await transport.sendMail({
          messageId,
          headers: { "X-OTP-Delivery-ID": otpId },
          from: process.env.EMAIL_FROM,
          to,
          subject: "Your TCF verification code",
          text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
        });
        break;
      } catch (error) {
        lastError = error;
        const responseCode =
          error && typeof error === "object" && "responseCode" in error
            ? Number(error.responseCode)
            : undefined;
        const retryableSmtpRejection = responseCode !== undefined &&
          responseCode >= 400 && responseCode < 500;
        if (attempt >= 2 || !retryableSmtpRejection) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      } finally {
        transport?.close();
      }
    }

    if (!accepted) {
      const errorCode = this.safeErrorCode(lastError);
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: "FAILED", error: errorCode },
      }).catch(() => undefined);
      this.logger.error(JSON.stringify({
        event: "notification.email.delivery_failed",
        notificationId: logId,
        errorCode,
      }));
      throw new ServiceUnavailableException("Could not send the verification email. Please try again shortly.");
    }

    try {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: "SENT",
          providerMessageId: accepted.messageId ?? messageId,
          sentAt: new Date(),
          error: null,
          payload: {
            otpId,
            providerResponse: accepted.response?.slice(0, 500) ?? null,
          },
        },
      });
    } catch (error) {
      this.logger.error(JSON.stringify({
        event: "notification.email.accepted_status_update_failed",
        notificationId: logId,
        errorCode: this.safeErrorCode(error),
      }));
      const failure = new ServiceUnavailableException("Email was accepted but its delivery status could not be confirmed.");
      Object.assign(failure, { emailAccepted: true });
      throw failure;
    }
    this.logger.log(JSON.stringify({
      event: "notification.email.accepted",
      notificationId: logId,
      providerMessageId: accepted.messageId ?? messageId,
    }));
    return { id: logId, messageId: accepted.messageId ?? messageId, alreadySent: false };
  }

  private createOtpTransport(): Transporter {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!host || !from) {
      throw new ServiceUnavailableException("Email delivery is not configured");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535 || (user && !pass)) {
      throw new ServiceUnavailableException("Email delivery configuration is invalid");
    }
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 12_000,
    });
  }

  private messageIdDomain() {
    const address = process.env.EMAIL_FROM?.trim() ?? "";
    const domain = address.match(/@([^>\s]+)/)?.[1];
    return domain || "localhost";
  }

  private safeErrorCode(error: unknown) {
    if (error && typeof error === "object") {
      if ("code" in error && typeof error.code === "string") return error.code;
      if ("responseCode" in error) return `SMTP_${String(error.responseCode)}`;
      if ("name" in error && typeof error.name === "string") return error.name;
    }
    return "UnknownError";
  }
  async emailAdminInvite(
    to: string,
    firstName: string,
    inviteUrl: string,
    inviteId?: string,
  ) {
    return this.getQueue().add(
      "email.admin-invite",
      { to, firstName, inviteUrl },
      {
        ...(inviteId ? { jobId: `admin-invite-${inviteId}` } : {}),
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  async health() {
    const queue = this.getQueue();
    const [counts, heartbeat] = await Promise.all([
      queue.getJobCounts("waiting", "active", "delayed", "failed"),
      this.redis.client.get("notifications:worker:heartbeat"),
    ]);
    const heartbeatAt = heartbeat ? Number(heartbeat) : undefined;
    const workerOnline = heartbeatAt !== undefined && Date.now() - heartbeatAt < 60_000;
    let otpEncryptionConfigured = true;
    try {
      assertOtpEmailEncryptionKey();
    } catch {
      otpEncryptionConfigured = false;
    }
    return {
      status: workerOnline && otpEncryptionConfigured ? "ok" : "degraded",
      workerOnline,
      otpEncryptionConfigured,
      workerHeartbeatAgeMs:
        heartbeatAt === undefined ? undefined : Date.now() - heartbeatAt,
      jobs: counts,
    };
  }
  async whatsappCourseEnrollment(data: {
    userId: string;
    phone: string;
    courseName: string;
  }) {
    return this.getQueue().add("whatsapp.course-enrollment", data, {
      jobId: `enrollment:${data.userId}:${data.courseName}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
