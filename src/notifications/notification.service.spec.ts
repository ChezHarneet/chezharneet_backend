import assert from "node:assert/strict";
import test from "node:test";
import { NotificationService } from "./notification.service";

test("notification queue does not open Redis during API startup", async () => {
  const redis = {
    get client(): never {
      throw new Error("Redis should not be accessed during API startup");
    },
  };
  const notifications = new NotificationService(redis);

  await notifications.onModuleDestroy();
  assert.ok(notifications);
});
