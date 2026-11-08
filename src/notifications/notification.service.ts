import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "../common/redis.service";

@Injectable()
export class NotificationService implements OnModuleDestroy {
  private queue?: Queue;

  constructor(
    @Inject(RedisService)
    private readonly redis: Pick<RedisService, "client">,
  ) {}

  private getQueue(): Queue {
    this.queue ??= new Queue("notifications", {
      connection: this.redis.client,
    });
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async emailOtp(to: string, code: string) {
    return this.getQueue().add(
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
  async emailAdminInvite(to: string, firstName: string, inviteUrl: string) {
    return this.getQueue().add(
      "email.admin-invite",
      { to, firstName, inviteUrl },
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
    return this.getQueue().add("whatsapp.course-enrollment", data, {
      jobId: `enrollment:${data.userId}:${data.courseName}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
