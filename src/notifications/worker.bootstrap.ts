import { Inject, Injectable,OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../common/prisma.service';
import * as https from 'https';
import nodemailer from 'nodemailer';
@Injectable() export class WorkerBootstrap implements OnModuleInit{
 constructor(@Inject(PrismaService) private db:PrismaService){}
 onModuleInit(){const c=new IORedis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null});
  new Worker('notifications',async job=>{if(job.name==='email.otp')return this.sendEmail(job.data.to,job.data.code);if(job.name==='whatsapp.course-enrollment')return this.sendWhatsApp(job.data);},{connection:c,concurrency:20});}
 private async sendEmail(to:string,code:string){
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:Number(process.env.SMTP_PORT??587)===465,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});
  await transport.sendMail({from:process.env.EMAIL_FROM,to,subject:'Your TCF verification code',text:`Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`});
}
 private async sendWhatsApp(data:any){
  const token=process.env.WHATSAPP_ACCESS_TOKEN, phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;if(!token||!phoneId)throw new Error('WhatsApp credentials missing');
  const url=`${process.env.WHATSAPP_GRAPH_URL??'https://graph.facebook.com'}/${process.env.WHATSAPP_API_VERSION??'v23.0'}/${phoneId}/messages`;
  const body=JSON.stringify({messaging_product:'whatsapp',to:data.phone,type:'template',template:{name:process.env.WHATSAPP_TEMPLATE_PURCHASE,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE??'en_US'},components:[{type:'body',parameters:[{type:'text',text:data.courseName}]}]}});
  await new Promise((resolve,reject)=>{const u=new URL(url);const req=https.request({hostname:u.hostname,path:u.pathname,method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{let out='';res.on('data',d=>out+=d);res.on('end',()=>res.statusCode&&res.statusCode>=200&&res.statusCode<300?resolve(out):reject(new Error(`WhatsApp ${res.statusCode}: ${out}`)))});req.on('error',reject);req.write(body);req.end();});
 }
}
