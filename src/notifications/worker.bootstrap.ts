import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import * as https from "https";
import nodemailer from "nodemailer";

@Injectable()
export class WorkerBootstrap implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerBootstrap.name);
  private connection?: IORedis;
  private worker?: Worker;

  onModuleInit() {
    if (process.env.VERCEL === "1") {
      this.logger.log("Notification worker is disabled in Vercel serverless runtime.");
      return;
    }

    this.connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null },
    );
    this.worker = new Worker(
      "notifications",
      async (job) => {
        if (job.name === "email.otp") {
          return this.sendEmail(job.data.to, job.data.code);
        }
        if (job.name === "email.admin-invite") {
          return this.sendAdminInviteEmail(
            job.data.to,
            job.data.firstName,
            job.data.inviteUrl,
          );
        }
        if (job.name === "whatsapp.course-enrollment") {
          return this.sendWhatsApp(job.data);
        }
      },
      { connection: this.connection, concurrency: 20 },
    );
    this.worker.on("ready", () => {
      this.logger.log("Notification worker is ready to process queued jobs.");
    });
    this.worker.on("completed", (job) => {
      this.logger.log(`Notification job ${job.name} (${job.id}) completed.`);
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Notification job ${job?.name ?? "unknown"} (${job?.id ?? "unknown"}) failed: ${error.message}`,
      );
    });
    this.worker.on("error", (error) => {
      const code = "code" in error ? String(error.code) : "";
      const details = [error.name, code, error.message || "No error message provided."]
        .filter(Boolean)
        .join(": ");
      this.logger.error(`Notification worker error: ${details}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async sendEmail(to: string, code: string) {
    const transport = this.createEmailTransport();
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: "Your TCF verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
    });
  }

  private async sendAdminInviteEmail(
    to: string,
    firstName: string,
    inviteUrl: string,
  ) {
    const transport = this.createEmailTransport();
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: "You're invited to the TCF Content Studio",
      text: `Hello ${firstName},\n\nYou have been invited to join the TCF Content Studio as an administrator. Accept your invitation using this one-time link within 24 hours:\n\n${inviteUrl}\n\nAfter accepting, sign in with the email OTP sent to this address. No password is shared by email.`,
    });
  }

  private createEmailTransport() {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!host || !from) {
      throw new Error("SMTP_HOST and EMAIL_FROM must be configured for email delivery");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP_PORT must be a valid TCP port");
    }
    if (user && !pass) {
      throw new Error("SMTP_PASS must be configured when SMTP_USER is set");
    }
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  private async sendWhatsApp(data: {
    phone: string;
    courseName: string;
  }) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      throw new Error("WhatsApp credentials missing");
    }

    const url = `${process.env.WHATSAPP_GRAPH_URL ?? "https://graph.facebook.com"}/${process.env.WHATSAPP_API_VERSION ?? "v23.0"}/${phoneId}/messages`;
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      to: data.phone,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_PURCHASE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: data.courseName }],
          },
        ],
      },
    });

    await new Promise<void>((resolve, reject) => {
      const requestUrl = new URL(url);
      const request = https.request(
        {
          hostname: requestUrl.hostname,
          path: `${requestUrl.pathname}${requestUrl.search}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (response) => {
          let output = "";
          response.on("data", (chunk: Buffer) => {
            output += chunk.toString();
          });
          response.on("end", () => {
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              resolve();
              return;
            }
            reject(new Error(`WhatsApp ${response.statusCode}: ${output}`));
          });
        },
      );
      request.on("error", reject);
      request.write(body);
      request.end();
    });
  }
}
