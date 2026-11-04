import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Role } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  CmsListQueryDto,
  CmsExportQueryDto,
  CmsImportDto,
  CmsPayloadDto,
  parseCmsResource,
} from "./cms.dto";
import { CmsAdminGuard } from "./cms-admin.guard";
import { CmsService } from "./cms.service";

type CmsActor = { sub: string };

@Controller("admin/cms")
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class CmsController {
  constructor(@Inject(CmsService) private readonly cms: CmsService) {}

  @Get("dashboard")
  dashboard() {
    return this.cms.dashboard();
  }

  @Get("export")
  exportContent(@Query() query: CmsExportQueryDto) {
    return this.cms.exportContent(
      parseCmsResource(query.resource),
      query.offset,
      query.limit,
    );
  }

  @Post("import/preview")
  previewImport(@Body() body: CmsImportDto) {
    return this.cms.previewImport(parseCmsResource(body.resource), body.records);
  }

  @Post("import")
  importContent(
    @Body() body: CmsImportDto,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.importRecords(parseCmsResource(body.resource), body.records, actor.sub);
  }

  @Get(":resource")
  list(
    @Param("resource") resource: string,
    @Query() query: CmsListQueryDto,
  ) {
    return this.cms.list(parseCmsResource(resource), query);
  }

  @Post(":resource")
  create(
    @Param("resource") resource: string,
    @Body() body: CmsPayloadDto,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.create(parseCmsResource(resource), body, actor.sub);
  }

  @Patch(":resource/:id")
  update(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @Body() body: CmsPayloadDto,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.update(parseCmsResource(resource), id, body, actor.sub);
  }

  @Post(":resource/:id/publish")
  publish(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.publish(parseCmsResource(resource), id, actor.sub);
  }

  @Post(":resource/:id/archive")
  @UseGuards(CmsAdminGuard)
  archive(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.archive(parseCmsResource(resource), id, actor.sub);
  }

  @Delete(":resource/:id")
  @UseGuards(CmsAdminGuard)
  remove(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.cms.remove(parseCmsResource(resource), id, actor.sub);
  }
}
