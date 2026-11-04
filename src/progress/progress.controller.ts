import {Body,Controller,Get,Inject,Param,Put,UseGuards} from '@nestjs/common';
import {IsBoolean} from 'class-validator';
import {AuthGuard} from '../auth/auth.guard';
import {CurrentUser} from '../auth/current-user.decorator';
import {ProgressService} from './progress.service';
class ProgressDto{@IsBoolean() completed!:boolean;}
@Controller('progress') @UseGuards(AuthGuard)
export class ProgressController{
 constructor(@Inject(ProgressService) private progress:ProgressService){}
 @Get('me') mine(@CurrentUser() user:{sub:string}){return this.progress.mine(user.sub);}
 @Put(':topicId') update(@CurrentUser() user:{sub:string},@Param('topicId') topicId:string,@Body() body:ProgressDto){return this.progress.update(user.sub,topicId,body.completed);}
}
