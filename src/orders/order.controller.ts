import { Controller, Inject, NotImplementedException, Param, Post } from "@nestjs/common";
import { OrderService } from "./order.service";
@Controller("orders")
export class OrderController {
  constructor(@Inject(OrderService) private orders: OrderService) {}
  @Post(":id/mark-paid") markPaid(@Param("id") id: string) {
    void id;
    throw new NotImplementedException(
      "Payment confirmation is unavailable until a verified payment webhook is configured",
    );
  }
}
