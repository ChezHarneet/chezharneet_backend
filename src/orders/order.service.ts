import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { NotificationService } from "../notifications/notification.service";
@Injectable()
export class OrderService {
  constructor(
    @Inject(PrismaService)
    private db: PrismaService,
    @Inject(NotificationService)
    private notifications: NotificationService,
  ) {}
  async markPaid(orderId: string) {
    return this.db
      .$transaction(async (tx: Prisma.TransactionClient) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { course: true, user: true },
        });
        if (!order) throw new NotFoundException("Order not found");
        if (order.status === "PAID") {
          return {
            paid: order,
            phone: order.user.phone,
            courseName: order.course.title,
            userId: order.userId,
          };
        }
        const paid = await tx.order.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        await tx.enrollment.upsert({
          where: {
            userId_courseId: { userId: order.userId, courseId: order.courseId },
          },
          create: {
            userId: order.userId,
            courseId: order.courseId,
            orderId: order.id,
          },
          update: { status: "ACTIVE", orderId: order.id },
        });
        return {
          paid,
          phone: order.user.phone,
          courseName: order.course.title,
          userId: order.userId,
        };
      })
      .then(async (result: {
        phone?: string | null;
        courseName: string;
        userId: string;
      }) => {
        if (result.phone) {
          await this.notifications.whatsappCourseEnrollment({
            userId: result.userId,
            phone: result.phone,
            courseName: result.courseName,
          });
        }
        return result;
      });
  }
}
