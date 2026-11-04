import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CmsListQueryDto, parseCmsInput, parseCmsResource } from "./cms.dto";

test("CMS input preserves French accents and punctuation", () => {
  const parsed = parseCmsInput("topics", {
    themeId: "theme-1",
    slug: "les-sorties",
    title: "Les sorties pédagogiques",
    situation: "Vous cherchez des renseignements…",
    modelAnswer: "Bien sûr, j’aimerais vous poser quelques questions.",
  });
  assert.equal(parsed.title, "Les sorties pédagogiques");
  assert.equal(parsed.situation, "Vous cherchez des renseignements…");
});

test("CMS input rejects unknown fields rather than silently discarding them", () => {
  assert.throws(
    () =>
      parseCmsInput("courses", {
        slug: "french-exam",
        title: "French Exam",
        role: "ADMIN",
      }),
    BadRequestException,
  );
});

test("CMS input rejects unknown publication statuses", () => {
  assert.throws(
    () =>
      parseCmsInput("courses", {
        slug: "french-exam",
        title: "French Exam",
        status: "LIVE",
      }),
    BadRequestException,
  );
});

test("unsupported CMS resource names are rejected", () => {
  assert.throws(() => parseCmsResource("users"), BadRequestException);
});

test("CMS list query transforms URL pagination strings into bounded integers", async () => {
  const query = plainToInstance(CmsListQueryDto, { page: "2", pageSize: "20" });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 20);
  assert.deepEqual(await validate(query), []);
});

test("CMS list query rejects pagination values outside supported bounds", async () => {
  const query = plainToInstance(CmsListQueryDto, { page: "0", pageSize: "101" });
  assert.ok((await validate(query)).length > 0);
});
