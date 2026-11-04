import { BadRequestException, ConflictException, Injectable, NotImplementedException, UnauthorizedException, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { randomInt, createHash, createHmac, timingSafeEqual } from 'crypto';
import argon2 from 'argon2';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { NotificationService } from '../notifications/notification.service';
import { isEmail } from 'class-validator';

@Injectable()
export class AuthService {
 constructor(@Inject(PrismaService) private db:PrismaService,@Inject(RedisService) private redis:RedisService,@Inject(JwtService) private jwt:JwtService,@Inject(NotificationService) private notifications:NotificationService){}
 private hashCode(code:string){return createHash('sha256').update(code).digest('hex');}
 private codeMatches(code:string,hash:string){const candidate=Buffer.from(this.hashCode(code),'hex');const expected=Buffer.from(hash,'hex');return candidate.length===expected.length&&timingSafeEqual(candidate,expected);}
 private validateOtpInput(email:string,purpose:string,code?:string){
  if(typeof email!=='string'||!isEmail(email.trim())) throw new BadRequestException('A valid email address is required');
  if(!['SIGNUP','LOGIN','RESET_PASSWORD'].includes(purpose)) throw new BadRequestException('Invalid OTP purpose');
  if(code!==undefined&&(typeof code!=='string'||!/^\d{6}$/.test(code))) throw new BadRequestException('OTP must be six digits');
 }
 async requestEmailOtp(email:string,purpose:'SIGNUP'|'LOGIN'|'RESET_PASSWORD'){
    this.validateOtpInput(email,purpose);
    if(purpose==='RESET_PASSWORD') throw new NotImplementedException('Password reset is not available yet');
  const normalizedEmail=email.trim().toLowerCase();
  const key=`otp:cooldown:${purpose}:${normalizedEmail}`;
  if(await this.redis.client.exists(key)) {
    const activeOtp=await this.db.otpCode.findFirst({where:{email:normalizedEmail,purpose,consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},select:{expiresAt:true}});
    const retryAfterSeconds=Math.max(1,await this.redis.client.ttl(key));
    return {queued:true,retryAfterSeconds,expiresAt:activeOtp?.expiresAt.toISOString(),resendAfterSeconds:retryAfterSeconds};
  }
  const code=String(randomInt(100000,1000000)); const hash=this.hashCode(code); const expires=new Date(Date.now()+600*1000);
  const user=await this.db.user.findUnique({where:{email:normalizedEmail}});
  if(purpose==='SIGNUP'&&user) throw new ConflictException('Email already registered');
  await this.db.otpCode.create({data:{userId:user?.id,email:normalizedEmail,purpose,codeHash:hash,expiresAt:expires}});
  await this.redis.client.set(key,'1','EX',60);
  await this.notifications.emailOtp(normalizedEmail,code);
  return {queued:true,expiresAt:expires.toISOString(),resendAfterSeconds:60,devCode:process.env.NODE_ENV==='development'?code:undefined};
 }
 async verifyOtp(email:string,code:string,purpose:'SIGNUP'|'LOGIN'|'RESET_PASSWORD'){
    this.validateOtpInput(email,purpose,code);
    if(purpose==='RESET_PASSWORD') throw new NotImplementedException('Password reset is not available yet');
  const normalizedEmail=email.trim().toLowerCase();
  const now=new Date();
  const otps=await this.db.otpCode.findMany({where:{email:normalizedEmail,purpose,consumedAt:null,expiresAt:{gt:now}},orderBy:{createdAt:'desc'}});
  if(!otps.length) throw new UnauthorizedException('Invalid or expired OTP');
  const maxAttempts=Number(process.env.OTP_MAX_ATTEMPTS??5);
  if(otps.reduce((total,otp)=>total+otp.attempts,0)>=maxAttempts) throw new UnauthorizedException('Too many attempts');
  const matched=otps.find(otp=>otp.attempts<maxAttempts&&this.codeMatches(code,otp.codeHash));
  if(!matched){await this.db.otpCode.update({where:{id:otps[0].id},data:{attempts:{increment:1}}});throw new UnauthorizedException('Invalid OTP');}
  await this.db.otpCode.updateMany({where:{email:normalizedEmail,purpose,consumedAt:null},data:{consumedAt:now}});
  let user=await this.db.user.findUnique({where:{email:normalizedEmail}});
  if(purpose==='SIGNUP'&&!user) user=await this.db.user.create({data:{email:normalizedEmail,emailVerifiedAt:now}});
  if(!user) throw new UnauthorizedException('User not found');
  if(!user.isActive) throw new ForbiddenException('Account is unavailable');
  await this.db.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()}});
  return this.tokens(user.id,user.email,user.role);
 }
 async profile(userId:string){
  const user=await this.db.user.findUnique({where:{id:userId},select:{id:true,email:true,firstName:true,lastName:true,phone:true,role:true,createdAt:true}});
  if(!user) throw new NotFoundException('User not found');
  return user;
 }
 async updateProfile(userId:string,profile:{firstName?:string;lastName?:string;phone?:string}){
  return this.db.user.update({where:{id:userId},data:profile,select:{id:true,email:true,firstName:true,lastName:true,phone:true,role:true,createdAt:true}});
 }
 private oauthSecret(){return process.env.OAUTH_STATE_SECRET??process.env.JWT_ACCESS_SECRET??'development-oauth-secret';}
 private oauthState(provider:'google'|'github'){const value=`${provider}:${Date.now()}`;const signature=createHmac('sha256',this.oauthSecret()).update(value).digest('hex');return `${value}.${signature}`;}
 private verifyOauthState(state:string,provider:'google'|'github'){const [value,signature]=state.split('.');if(!value||!signature||!value.startsWith(`${provider}:`))throw new UnauthorizedException('Invalid OAuth state');const expected=createHmac('sha256',this.oauthSecret()).update(value).digest('hex');if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected))||Date.now()-Number(value.split(':')[1])>10*60*1000)throw new UnauthorizedException('Expired OAuth state');}
 oauthUrl(provider:'google'|'github'){const state=this.oauthState(provider);const callback=`${process.env.API_PUBLIC_URL??'http://localhost:4000/api'}/auth/oauth/${provider}/callback`;if(provider==='google'){const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID??'',redirect_uri:callback,response_type:'code',scope:'openid email profile',state,access_type:'offline'});return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;}const params=new URLSearchParams({client_id:process.env.GITHUB_CLIENT_ID??'',redirect_uri:callback,response_type:'code',scope:'read:user user:email',state});return `https://github.com/login/oauth/authorize?${params}`;}
 async oauthLogin(provider:'google'|'github',code:string,state:string){this.verifyOauthState(state,provider);const callback=`${process.env.API_PUBLIC_URL??'http://localhost:4000/api'}/auth/oauth/${provider}/callback`;let email:string|undefined;let firstName:string|undefined;let lastName:string|undefined;if(provider==='google'){const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID??'',client_secret:process.env.GOOGLE_CLIENT_SECRET??'',redirect_uri:callback,grant_type:'authorization_code'})});if(!tokenResponse.ok)throw new UnauthorizedException('Google OAuth failed');const tokens=await tokenResponse.json() as {access_token:string};const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!profileResponse.ok)throw new UnauthorizedException('Could not read Google profile');const profile=await profileResponse.json() as {email?:string;given_name?:string;family_name?:string};email=profile.email;firstName=profile.given_name;lastName=profile.family_name;}else{const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID??'',client_secret:process.env.GITHUB_CLIENT_SECRET??'',code,redirect_uri:callback})});if(!tokenResponse.ok)throw new UnauthorizedException('GitHub OAuth failed');const tokens=await tokenResponse.json() as {access_token:string};const profileResponse=await fetch('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${tokens.access_token}`}});if(!profileResponse.ok)throw new UnauthorizedException('Could not read GitHub profile');const profile=await profileResponse.json() as {email?:string;name?:string};email=profile.email;if(!email){const emailsResponse=await fetch('https://api.github.com/user/emails',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${tokens.access_token}`}});const emails=await emailsResponse.json() as {email:string;primary:boolean;verified:boolean}[];email=emails.find(item=>item.primary&&item.verified)?.email;}[firstName,lastName]=(profile.name??'').split(' ',2) as [string|undefined,string|undefined];}if(!email)throw new UnauthorizedException('OAuth provider did not return an email address');let user=await this.db.user.findUnique({where:{email:email.toLowerCase()}});if(!user)user=await this.db.user.create({data:{email:email.toLowerCase(),firstName,lastName,emailVerifiedAt:new Date()}});else await this.db.user.update({where:{id:user.id},data:{firstName:user.firstName??firstName,lastName:user.lastName??lastName,emailVerifiedAt:user.emailVerifiedAt??new Date()}});if(!user.isActive)throw new ForbiddenException('Account is unavailable');return this.tokens(user.id,user.email,user.role);}
 private async tokens(id:string,email:string,role:string){const access=await this.jwt.signAsync({sub:id,email,role},{expiresIn:(process.env.ACCESS_TOKEN_TTL??'15m') as JwtSignOptions['expiresIn']});return {accessToken:access};}
}
