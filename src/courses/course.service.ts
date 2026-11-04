import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable() 
export class CourseService { 
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  list() {
    return this.db.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceMinor: true,
        currency: true,
        isFree: true,
      },
    });
  }

  async library(slug: string, userId?: string) {
    const course = await this.db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, isFree: true },
    });
    if (!course) throw new NotFoundException("Course not found");
    await this.assertCourseAccess(course.id, course.isFree, userId);

    const topicScope = {
      status: "PUBLISHED" as const,
      theme: {
        is: {
          status: "PUBLISHED" as const,
          module: {
            is: {
              status: "PUBLISHED" as const,
              courseId: course.id,
            },
          },
        },
      },
    };
    const [topics, vocabulary, grammar] = await Promise.all([
      this.db.topic.findMany({
        where: topicScope,
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          situation: true,
          question: true,
          modelAnswer: true,
          extraInformation: true,
          conclusion: true,
          theme: {
            select: {
              id: true,
              slug: true,
              name: true,
              task: { select: { type: true, module: { select: { skill: true } } } },
            },
          },
        },
      }),
      this.db.vocabulary.findMany({
        where: { topic: { is: topicScope } },
        orderBy: [{ sortOrder: "asc" }, { term: "asc" }],
        select: {
          id: true,
          term: true,
          meaning: true,
          example: true,
          topic: { select: { id: true, title: true } },
        },
      }),
      this.db.grammarNote.findMany({
        where: { topic: { is: topicScope } },
        orderBy: [{ sortOrder: "asc" }, { rule: "asc" }],
        select: {
          id: true,
          rule: true,
          explanation: true,
          example: true,
          topic: { select: { id: true, title: true } },
        },
      }),
    ]);
    return { topics, vocabulary, grammar };
  }

  async structure(slug: string, userId?: string) {
    const course = await this.db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        isFree: true,
        modules: {
          where: { status: "PUBLISHED" },
          orderBy: { sortOrder: "asc" },
          select: {
            slug: true,
            title: true,
            description: true,
            skill: true,
            examLabel: true,
            durationMinutes: true,
            questionCount: true,
            tasks: {
              where: { status: "PUBLISHED" },
              orderBy: { sortOrder: "asc" },
              select: {
                type: true,
                format: true,
                title: true,
                description: true,
                instructions: true,
                durationMinutes: true,
                questionCount: true,
                practiceSets: {
                  where: { status: "PUBLISHED" },
                  orderBy: { sortOrder: "asc" },
                  select: {
                    slug: true,
                    title: true,
                    description: true,
                    mode: true,
                    durationMinutes: true,
                    questionCount: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("Course not found");
    await this.assertCourseAccess(course.id, course.isFree, userId);
    const { isFree: _isFree, ...publicCourse } = course;
    return publicCourse;
  }

  async speaking(slug: string, userId?: string) {
    const course = await this.db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        title: true,
        isFree: true,
        modules: {
          where: { skill: "SPEAKING", status: "PUBLISHED" },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            slug: true,
            title: true,
            tasks: {
              where: { status: "PUBLISHED" },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                type: true,
                format: true,
                title: true,
                description: true,
                instructions: true,
                durationMinutes: true,
                questionCount: true,
                themes: {
                  where: { status: "PUBLISHED" },
                  orderBy: { sortOrder: "asc" },
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    description: true,
                    sortOrder: true,
                    topics: {
                      where: { status: "PUBLISHED" },
                      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
                      select: {
                        id: true,
                        slug: true,
                        title: true,
                        situation: true,
                        question: true,
                        modelAnswer: true,
                        extraInformation: true,
                        conclusion: true,
                        sortOrder: true,
                        vocabulary: {
                          orderBy: [{ sortOrder: "asc" }, { term: "asc" }],
                          select: {
                            id: true,
                            term: true,
                            meaning: true,
                            example: true,
                            sortOrder: true,
                          },
                        },
                        grammar: {
                          orderBy: [{ sortOrder: "asc" }, { rule: "asc" }],
                          select: {
                            id: true,
                            rule: true,
                            explanation: true,
                            example: true,
                            sortOrder: true,
                          },
                        },
                        criteria: true,
                        media: true,
                      },
                    },
                  },
                },
                essays: {
                  where: { status: "PUBLISHED" },
                  orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    prompt: true,
                    content: true,
                    summary: true,
                    extraInformation: true,
                    sortOrder: true,
                    media: true,
                    versions: {
                      where: { status: "PUBLISHED" },
                      orderBy: [{ sortOrder: "asc" }, { versionLabel: "asc" }],
                      select: {
                        id: true,
                        versionLabel: true,
                        sortOrder: true,
                        sections: {
                          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                          select: {
                            id: true,
                            sectionType: true,
                            heading: true,
                            content: true,
                            sortOrder: true,
                          },
                        },
                      },
                    },
                    vocabulary: {
                      orderBy: [{ sortOrder: "asc" }, { frenchTerm: "asc" }],
                      select: {
                        id: true,
                        frenchTerm: true,
                        englishMeaning: true,
                        example: true,
                        sortOrder: true,
                      },
                    },
                    grammarNotes: {
                      orderBy: [{ sortOrder: "asc" }, { structure: "asc" }],
                      select: {
                        id: true,
                        structure: true,
                        example: true,
                        purpose: true,
                        explanation: true,
                        sortOrder: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("Course not found");
    await this.assertCourseAccess(course.id, course.isFree, userId);
    const { isFree: _isFree, ...publicCourse } = course;
    return publicCourse;
  }

  async task2(slug: string, userId?: string) {
    const course = await this.db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        title: true,
        isFree: true,
        modules: {
          where: { skill: "SPEAKING", status: "PUBLISHED" },
          select: {
            id: true,
            tasks: {
              where: { type: "TASK2", status: "PUBLISHED" },
              select: {
                id: true,
                title: true,
                description: true,
                instructions: true,
                durationMinutes: true,
              },
            },
            themes: {
              where: {
                status: "PUBLISHED",
                OR: [
                  { taskId: null },
                  { task: { is: { type: "TASK2", status: "PUBLISHED" } } },
                ],
              },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                sortOrder: true,
                topics: {
                  where: { status: "PUBLISHED" },
                  orderBy: { sortOrder: "asc" },
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    situation: true,
                    sortOrder: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("Course not found");
    await this.assertCourseAccess(course.id, course.isFree, userId);
    const { isFree: _isFree, ...publicCourse } = course;
    return { ...publicCourse, module: course.modules[0] ?? null };
  }

  async topic(slug: string, themeSlug?: string, userId?: string, courseSlug?: string) {
    const data = await this.db.topic.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        theme: {
          is: {
            status: "PUBLISHED",
            ...(themeSlug ? { slug: themeSlug } : {}),
            module: {
              is: {
                status: "PUBLISHED",
                course: {
                  is: {
                    status: "PUBLISHED",
                    ...(courseSlug ? { slug: courseSlug } : {}),
                  },
                },
              },
            },
            OR: [
              { taskId: null },
              { task: { is: { status: "PUBLISHED" } } },
            ],
          },
        },
      },
      include: {
        theme: {
          include: {
            module: {
              include: {
                course: { select: { id: true, isFree: true } },
              },
            },
          },
        },
        vocabulary: { orderBy: { sortOrder: "asc" } },
        grammar: { orderBy: { sortOrder: "asc" } },
        criteria: true,
        media: true,
      },
    });
    if (!data) throw new NotFoundException("Topic not found");
    await this.assertCourseAccess(
      data.theme.module.course.id,
      data.theme.module.course.isFree,
      userId,
    );
    const {
      theme: {
        module: { course: _course, ...module },
        ...theme
      },
      ...publicTopic
    } = data;
    return { ...publicTopic, theme: { ...theme, module } };
  }

  private async assertCourseAccess(
    courseId: string,
    isFree: boolean,
    userId?: string,
  ): Promise<void> {
    if (isFree) return;
    if (!userId) {
      throw new ForbiddenException("An active course enrollment is required");
    }
    const enrollment = await this.db.enrollment.findFirst({
      where: {
        courseId,
        userId,
        status: "ACTIVE",
        startsAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException("An active course enrollment is required");
    }
  }
}
