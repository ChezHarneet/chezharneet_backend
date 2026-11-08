import assert from "node:assert/strict";
import test from "node:test";
import { WorkerBootstrap } from "./worker.bootstrap";

test("notification worker does not start in Vercel serverless runtime", () => {
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const worker = new WorkerBootstrap();
    assert.doesNotThrow(() => worker.onModuleInit());
    assert.doesNotThrow(() => worker.onModuleDestroy());
  } finally {
    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  }
});

test("development worker command loads backend environment before startup", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const packageJson = JSON.parse(
    await readFile(resolve(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts["dev:worker"], /--env-file=\.env/);
  assert.match(packageJson.scripts["dev:worker"], /src\/notifications\/worker\.main\.ts/);
});
