import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AuthController } from "./auth.controller";

test("OTP verification returns only the access token and sets an HttpOnly refresh cookie", async () => {
  const headers: Record<string, string> = {};
  const controller = new AuthController({
    verifyOtp: async () => ({
      accessToken: "short-lived-access",
      refreshToken: "opaque-refresh",
    }),
  } as any, {} as any);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousApiPublicUrl = process.env.API_PUBLIC_URL;
  process.env.NODE_ENV = "development";
  delete process.env.API_PUBLIC_URL;
  try {
    const result = await controller.verify(
      { email: "person@example.com", code: "123456", purpose: "LOGIN" },
      { header: (name: string, value: string) => { headers[name] = value; } },
    );
    assert.deepEqual(result, { accessToken: "short-lived-access" });
    assert.match(headers["Set-Cookie"], /tcf_refresh=opaque-refresh/);
    assert.match(headers["Set-Cookie"], /HttpOnly/);
    assert.match(headers["Set-Cookie"], /SameSite=Lax/);
    assert.doesNotMatch(JSON.stringify(result), /opaque-refresh/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousApiPublicUrl === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousApiPublicUrl;
  }
});

test("refresh rotates the HttpOnly cookie only for a trusted browser origin", async () => {
  let receivedToken = "";
  const headers: Record<string, string> = {};
  const controller = new AuthController({
    refreshSession: async (token: string) => {
      receivedToken = token;
      return { accessToken: "new-access", refreshToken: "new-refresh" };
    },
  } as any, {} as any);
  const result = await controller.refresh(
    {
      headers: {
        origin: "http://localhost:3000",
        cookie: "other=value; tcf_refresh=old-refresh",
      },
    },
    { header: (name: string, value: string) => { headers[name] = value; } },
  );
  assert.equal(receivedToken, "old-refresh");
  assert.deepEqual(result, { accessToken: "new-access" });
  assert.match(headers["Set-Cookie"], /tcf_refresh=new-refresh/);

  await assert.rejects(
    controller.refresh(
      { headers: { origin: "https://attacker.example", cookie: "tcf_refresh=stolen" } },
      { header: () => undefined },
    ),
    ForbiddenException,
  );
});
