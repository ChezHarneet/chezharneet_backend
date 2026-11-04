import assert from "node:assert/strict";
import test from "node:test";
import { CmsService } from "./cms.service";

test("CMS list converts pagination query strings before calling Prisma", async () => {
  let findManyArgs: Record<string, unknown> | undefined;
  const db = {
    course: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs = args;
        return [];
      },
      count: async () => 0,
    },
  };
  const service = new CmsService(db as never);

  const result = await service.list("courses", { page: "2", pageSize: "20" } as never);

  assert.equal(findManyArgs?.skip, 20);
  assert.equal(findManyArgs?.take, 20);
  assert.deepEqual(result, { items: [], total: 0, page: 2, pageSize: 20, pageCount: 0 });
});

test("CMS list rejects malformed pagination before reaching Prisma", async () => {
  const service = new CmsService({} as never);
  await assert.rejects(
    service.list("courses", { page: "1.5", pageSize: "20" } as never),
    /page must be an integer/,
  );
});
