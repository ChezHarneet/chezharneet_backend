import { Module } from "@nestjs/common";
import { WorkerBootstrap } from "./worker.bootstrap";

@Module({
  providers: [WorkerBootstrap],
})
export class NotificationsWorkerModule {}
