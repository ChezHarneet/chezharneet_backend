import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsString, Length, Matches } from 'class-validator';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminUsersService } from './admin-users.service';

class UpdateUserRoleDto {
  @IsEnum(Role) role!: Role;
}

class InviteAdminDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 80) @Matches(/\S/) firstName!: string;
  @IsString() @Length(1, 80) @Matches(/\S/) lastName!: string;
}

@Controller('admin/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminUsersController {
  constructor(@Inject(AdminUsersService) private readonly users: AdminUsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post('invitations')
  @Roles(Role.SUPER_ADMIN)
  invite(
    @CurrentUser() user: { sub: string },
    @Body() body: InviteAdminDto,
  ) {
    return this.users.inviteAdmin(body.email, body.firstName, body.lastName, user.sub);
  }

  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN)
  updateRole(@Param('id') id: string, @Body() body: UpdateUserRoleDto) {
    return this.users.updateRole(id, body.role);
  }
}
