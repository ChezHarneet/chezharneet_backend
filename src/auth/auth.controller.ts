import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Res,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
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
  constructor(@Inject(AuthService) private auth: AuthService) {}
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
    const url = `${process.env.WEB_URL ?? "http://localhost:3000"}/auth/callback#access_token=${encodeURIComponent(result.accessToken)}`;
    reply.code(302);
    reply.header("Location", url);
    return reply.send();
  }
  @Post("otp/request") @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60000 } }) request(@Body() d: RequestOtpDto) {
    return this.auth.requestEmailOtp(d.email, d.purpose);
  }
  @Post("otp/verify") @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) verify(@Body() d: VerifyOtpDto) {
    return this.auth.verifyOtp(d.email, d.code, d.purpose);
  }
}
