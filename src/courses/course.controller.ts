import {
  Controller,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { OptionalAuthGuard } from "../auth/optional-auth.guard";
import { CourseService } from "./course.service";

type AuthenticatedUser = { sub: string };

@Controller("courses") 
export class CourseController {
  constructor(@Inject(CourseService) private readonly courses: CourseService) {}

  @Get()
  list() {
    return this.courses.list();
  }

  @Get(":slug/library")
  @UseGuards(OptionalAuthGuard)
  library(
    @Param("slug") slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.library(slug, user?.sub);
  }

  @Get(":slug/structure")
  @UseGuards(OptionalAuthGuard)
  structure(
    @Param("slug") slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.structure(slug, user?.sub);
  }

  @Get(":slug/speaking")
  @UseGuards(OptionalAuthGuard)
  speaking(
    @Param("slug") slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.speaking(slug, user?.sub);
  }

  @Get(":slug/task-2")
  @UseGuards(OptionalAuthGuard)
  task2(
    @Param("slug") slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.task2(slug, user?.sub);
  }

  @Get(":slug/task-2/:theme/:topic")
  @UseGuards(OptionalAuthGuard)
  topicByTheme(
    @Param("slug") courseSlug: string,
    @Param("theme") theme: string,
    @Param("topic") topic: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.topic(topic, theme, user?.sub, courseSlug);
  }

  @Get("topics/:slug")
  @UseGuards(OptionalAuthGuard)
  topic(
    @Param("slug") slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.courses.topic(slug, undefined, user?.sub);
  }
}
