import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "./prisma.service";

test("PrismaService retries a transient database connectivity failure", async () => {
  const service = new PrismaService();
  let attempts = 0;
  service.$connect = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error("Database unavailable"), {
        errorCode: "P1001",
      });
    }
  };

  await service.onModuleInit();

  assert.equal(attempts, 2);
});

test("PrismaService does not retry non-connectivity failures", async () => {
  const service = new PrismaService();
  const failure = new Error("Invalid database credentials");
  let attempts = 0;
  service.$connect = async () => {
    attempts += 1;
    throw failure;
  };

  await assert.rejects(service.onModuleInit(), (error) => error === failure);
  assert.equal(attempts, 1);
});
