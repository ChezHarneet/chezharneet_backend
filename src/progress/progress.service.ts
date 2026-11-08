import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
@Injectable()
export class ProgressService {
  constructor(@Inject(PrismaService) private db: PrismaService) {}
  async mine(userId: string) {
    return this.db.progress.findMany({
      where: { userId },
      orderBy: { lastViewedAt: "desc" },
      select: {
        topicId: true,
        completed: true,
        lastViewedAt: true,
        completedAt: true,
      },
    });
  }
  async update(userId: string, topicId: string, completed: boolean) {
    const topic = await this.db.topic.findUnique({
      where: { id: topicId },
      select: { id: true },
    });
    if (!topic) throw new NotFoundException("Topic not found");
    return this.db.progress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        completed,
        completedAt: completed ? new Date() : null,
      },
      update: {
        completed,
        completedAt: completed ? new Date() : null,
        lastViewedAt: new Date(),
      },
      select: {
        topicId: true,
        completed: true,
        lastViewedAt: true,
        completedAt: true,
      },
    });
  }
}
