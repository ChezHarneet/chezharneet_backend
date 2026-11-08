import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Res,
  Req,
  Query,
  UseGuards,
  Inject,
  ForbiddenException,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { AdminUsersService } from "../admin/admin-users.service";

const REFRESH_COOKIE = "tcf_refresh";

class AcceptInviteDto {
  @IsString() @Length(20, 100) code!: string;
}

class RequestOtpDto {
  @IsEmail() email!: string;
  @IsIn(["SIGNUP", "LOGIN", "RESET_PASSWORD"]) purpose!:
    | "SIGNUP"
    | "LOGIN"
    | "RESET_PASSWORD";
}
class VerifyOtpDto {
  @IsEmail() email!: string;
  @IsString() @Length(6, 6) code!: string;
  @IsIn(["SIGNUP", "LOGIN", "RESET_PASSWORD"]) purpose!:
    | "SIGNUP"
    | "LOGIN"
    | "RESET_PASSWORD";
}
class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(AdminUsersService) private adminUsers: AdminUsersService,
  ) {}

  private refreshTokenFrom(request: any): string | undefined {
    const cookie = (request.headers?.cookie as string | undefined)
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));
    return cookie?.slice(REFRESH_COOKIE.length + 1) || undefined;
  }

  private setRefreshCookie(reply: any, token: string) {
    const secure =
      process.env.NODE_ENV === "production" ||
      process.env.API_PUBLIC_URL?.startsWith("https://") === true;
    reply.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=${secure ? "None" : "Lax"}${secure ? "; Secure" : ""}`,
    );
  }

  private clearRefreshCookie(reply: any) {
    const secure =
      process.env.NODE_ENV === "production" ||
      process.env.API_PUBLIC_URL?.startsWith("https://") === true;
    reply.header(
      "Set-Cookie",
      `${REFRESH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=${secure ? "None" : "Lax"}${secure ? "; Secure" : ""}`,
    );
  }

  private assertTrustedOrigin(request: any) {
    const origin = request.headers?.origin;
    const allowedOrigins = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      ...(process.env.CORS_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      ...(process.env.WEB_URL?.trim() ? [process.env.WEB_URL.trim()] : []),
    ];
    let normalizedOrigin: string;
    try {
      if (typeof origin !== "string") throw new Error("Missing Origin");
      normalizedOrigin = new URL(origin).origin;
    } catch {
      throw new ForbiddenException("Untrusted request origin");
    }
    if (!allowedOrigins.some((value) => {
      try {
        return new URL(value).origin === normalizedOrigin;
      } catch {
        return false;
      }
    })) {
      throw new ForbiddenException("Untrusted request origin");
    }
  }
  @Get("me") @UseGuards(AuthGuard) me(@CurrentUser() user: any) {
    return this.auth.profile(user.sub);
  }
  @Patch("me") @UseGuards(AuthGuard) updateMe(
    @CurrentUser() user: any,
    @Body() body: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(user.sub, body);
  }
  @Get("oauth/google") google(@Res() reply: any) {
    const url = this.auth.oauthUrl("google");
    reply.code(302);
    reply.header("Location", url);
    return reply.send();
  }
  @Get("oauth/google/callback") async googleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() reply: any,
  ) {
    const result = await this.auth.oauthLogin("google", code, state);
    this.setRefreshCookie(reply, result.refreshToken);
    const url = `${process.env.WEB_URL ?? "http://localhost:3000"}/auth/callback#access_token=${encodeURIComponent(result.accessToken)}`;
    reply.code(302);
    reply.header("Location", url);
    return reply.send();
  }
  @Get("oauth/github") github(@Res() reply: any) {
    const url = this.auth.oauthUrl("github");
    reply.code(302);
    reply.header("Location", url);
    return reply.send();
  }
  @Get("oauth/github/callback") async githubCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() reply: any,
  ) {
    const result = await this.auth.oauthLogin("github", code, state);
    this.setRefreshCookie(reply, result.refreshToken);
    const url = `${process.env.WEB_URL ?? "http://localhost:3000"}/auth/callback#access_token=${encodeURIComponent(result.accessToken)}`;
    reply.code(302);
    reply.header("Location", url);
    return reply.send();
  }
  @Post("otp/request") @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60000 } }) request(@Body() d: RequestOtpDto) {
    return this.auth.requestEmailOtp(d.email, d.purpose);
  }
  @Post("otp/verify") @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) async verify(
    @Body() d: VerifyOtpDto,
    @Res({ passthrough: true }) reply: any,
  ) {
    const { refreshToken, ...result } = await this.auth.verifyOtp(d.email, d.code, d.purpose);
    this.setRefreshCookie(reply, refreshToken);
    return result;
  } 

  @Post("refresh")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async refresh(@Req() request: any, @Res({ passthrough: true }) reply: any) {
    this.assertTrustedOrigin(request);
    const result = await this.auth.refreshSession(this.refreshTokenFrom(request) ?? "");
    this.setRefreshCookie(reply, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  async logout(@Req() request: any, @Res({ passthrough: true }) reply: any) {
    this.assertTrustedOrigin(request);
    await this.auth.revokeSession(this.refreshTokenFrom(request));
    this.clearRefreshCookie(reply);
    return { success: true };
  }

  @Post("invitations/accept")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  acceptInvitation(@Body() body: AcceptInviteDto) {
    return this.adminUsers.acceptInvitation(body.code);
  }
}
