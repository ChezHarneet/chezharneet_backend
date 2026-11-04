import {createParamDecorator,ExecutionContext} from '@nestjs/common';
export const CurrentUser=createParamDecorator((_:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest().user as {sub:string;email:string;role:string});
