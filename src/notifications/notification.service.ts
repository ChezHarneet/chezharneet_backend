import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
@Injectable()
export class NotificationService {
  private queue: Queue;
  constructor() {
    const c = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue("notifications", { connection: c });
  }
  async emailOtp(to: string, code: string) {
    return this.queue.add(
      "email.otp",
      { to, code },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
  async whatsappCourseEnrollment(data: {
    userId: string;
    phone: string;
    courseName: string;
  }) {
    return this.queue.add("whatsapp.course-enrollment", data, {
      jobId: `enrollment:${data.userId}:${data.courseName}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
