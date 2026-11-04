import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SpeakingCmsService } from "./speaking-cms.service";

type CmsActor = { sub: string };

@Controller("admin/cms/speaking")
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SpeakingCmsController {
  constructor(
    @Inject(SpeakingCmsService) private readonly speakingCms: SpeakingCmsService,
  ) {}

  @Get("content")
  content() {
    return this.speakingCms.content();
  }

  @Post("tasks/:taskId/pdf/extract")
  async extractTask3Pdf(
    @Param("taskId") taskId: string,
    @Req() request: FastifyRequest,
  ) {
    const file = await request.file();
    if (!file) throw new BadRequestException("Choose a PDF file to extract topics");
    if (file.mimetype !== "application/pdf" || !file.filename.toLowerCase().endsWith(".pdf")) {
      throw new BadRequestException("Only PDF files are supported");
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      if (file.file.truncated) {
        throw new PayloadTooLargeException("PDF files must be 15 MB or smaller");
      }
      throw error;
    }
    if (file.file.truncated || buffer.length > 15 * 1024 * 1024) {
      throw new PayloadTooLargeException("PDF files must be 15 MB or smaller");
    }
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new BadRequestException("The selected file is not a valid PDF");
    }

    const extraction = await this.speakingCms.extractTask3Pdf(taskId, buffer);
    return {
      fileName: file.filename,
      sizeBytes: buffer.length,
      ...extraction,
    };
  }

  @Post("tasks/:taskId/pdf/import")
  importTask3Topics(
    @Param("taskId") taskId: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.importTask3Topics(taskId, body, actor.sub);
  }

  @Post("essays/:essayId/versions")
  createVersion(
    @Param("essayId") essayId: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.createVersion(essayId, body, actor.sub);
  }

  @Patch("versions/:id")
  updateVersion(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.updateVersion(id, body, actor.sub);
  }

  @Post("versions/:id/publish")
  publishVersion(
    @Param("id") id: string,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.publishVersion(id, actor.sub);
  }

  @Post("versions/:versionId/sections")
  createSection(
    @Param("versionId") versionId: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.createSection(versionId, body, actor.sub);
  }

  @Patch("sections/:id")
  updateSection(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.updateSection(id, body, actor.sub);
  }

  @Post("essays/:essayId/vocabulary")
  createVocabulary(
    @Param("essayId") essayId: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.createVocabulary(essayId, body, actor.sub);
  }

  @Patch("vocabulary/:id")
  updateVocabulary(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.updateVocabulary(id, body, actor.sub);
  }

  @Post("essays/:essayId/grammar")
  createGrammarNote(
    @Param("essayId") essayId: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.createGrammarNote(essayId, body, actor.sub);
  }

  @Patch("grammar/:id")
  updateGrammarNote(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() actor: CmsActor,
  ) {
    return this.speakingCms.updateGrammarNote(id, body, actor.sub);
  }
}
