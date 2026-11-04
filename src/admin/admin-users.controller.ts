import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminUsersService } from './admin-users.service';

class UpdateUserRoleDto {
  @IsEnum(Role) role!: Role;
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

  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN)
  updateRole(@Param('id') id: string, @Body() body: UpdateUserRoleDto) {
    return this.users.updateRole(id, body.role);
  }
}
