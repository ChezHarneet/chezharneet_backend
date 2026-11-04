import {
  PrismaClient,
  ContentStatus,
  CourseSkill,
  TaskFormat,
  TaskType,
} from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('🌱 Starting platform seed...');

  const course = await db.course.upsert({
    where: {
      slug: 'french-exam',
    },
    update: {
      title: 'French Exam Preparation',
      description:
        'Independent French exam preparation platform.',
      status: ContentStatus.PUBLISHED,
      isFree: true,
      publishedAt: new Date(),
    },
    create: {
      slug: 'french-exam',
      title: 'French Exam Preparation',
      description:
        'Independent French exam preparation platform.',
      status: ContentStatus.PUBLISHED,
      isFree: true,
      publishedAt: new Date(),
    },
  });

  console.log(`✓ Course: ${course.title}`);

  const modules = [
    {
      skill: CourseSkill.SPEAKING,
      slug: 'expression-orale',
      title: 'Expression Orale',
      examLabel: '3 tasks · 12 minutes',
      durationMinutes: 12,
      questionCount: 3,
    },
    {
      skill: CourseSkill.WRITING,
      slug: 'expression-ecrite',
      title: 'Expression Écrite',
      examLabel: '3 tasks · 60 minutes',
      durationMinutes: 60,
      questionCount: 3,
    },
    {
      skill: CourseSkill.LISTENING,
      slug: 'comprehension-orale',
      title: 'Compréhension Orale',
      examLabel: '39 questions · 35 minutes',
      durationMinutes: 35,
      questionCount: 39,
    },
    {
      skill: CourseSkill.READING,
      slug: 'comprehension-ecrite',
      title: 'Compréhension Écrite',
      examLabel: '39 questions · 60 minutes',
      durationMinutes: 60,
      questionCount: 39,
    },
  ];

  for (let i = 0; i < modules.length; i++) {
    const moduleData = modules[i];

    const module = await db.courseModule.upsert({
      where: {
        courseId_skill: {
          courseId: course.id,
          skill: moduleData.skill,
        },
      },
      update: {
        slug: moduleData.slug,
        title: moduleData.title,
        examLabel: moduleData.examLabel,
        durationMinutes: moduleData.durationMinutes,
        questionCount: moduleData.questionCount,
        status: ContentStatus.PUBLISHED,
        sortOrder: i,
      },
      create: {
        courseId: course.id,
        skill: moduleData.skill,
        slug: moduleData.slug,
        title: moduleData.title,
        examLabel: moduleData.examLabel,
        durationMinutes: moduleData.durationMinutes,
        questionCount: moduleData.questionCount,
        status: ContentStatus.PUBLISHED,
        sortOrder: i,
      },
    });

    console.log(`✓ Module: ${module.title}`);

    /*
     * Speaking-specific structure
     *
     * Expression Orale
     * ├── Task 1
     * ├── Task 2
     * │   └── Themes
     * │       └── Topics
     * └── Task 3
     */
    if (moduleData.skill !== CourseSkill.SPEAKING) {
      continue;
    }

    const tasks = [
      {
        type: TaskType.TASK1,
        format: TaskFormat.SPEAKING_INTERVIEW,
        title: 'Introduction & personal presentation',
        description:
          'Present yourself and speak naturally about your life, studies, work and interests.',
        durationMinutes: 2,
        questionCount: 1,
        sortOrder: 1,
      },
      {
        type: TaskType.TASK2,
        format: TaskFormat.SPEAKING_INTERACTION,
        title: 'Interaction on a given theme',
        description:
          'Ask questions in a realistic situation to obtain information.',
        durationMinutes: 4,
        questionCount: 40,
        sortOrder: 2,
      },
      {
        type: TaskType.TASK3,
        format: TaskFormat.SPEAKING_VIEWPOINT,
        title: 'Expressing and defending a point of view',
        description:
          'Express and defend an opinion with a clear structure and examples.',
        durationMinutes: 5,
        questionCount: 60,
        sortOrder: 3,
      },
    ];

    for (const taskData of tasks) {
      const task = await db.task.upsert({
        where: {
          moduleId_type: {
            moduleId: module.id,
            type: taskData.type,
          },
        },
        update: {
          format: taskData.format,
          title: taskData.title,
          description: taskData.description,
          durationMinutes: taskData.durationMinutes,
          questionCount: taskData.questionCount,
          status: ContentStatus.PUBLISHED,
          sortOrder: taskData.sortOrder,
        },
        create: {
          moduleId: module.id,
          type: taskData.type,
          format: taskData.format,
          title: taskData.title,
          description: taskData.description,
          durationMinutes: taskData.durationMinutes,
          questionCount: taskData.questionCount,
          status: ContentStatus.PUBLISHED,
          sortOrder: taskData.sortOrder,
        },
      });

      console.log(`  ✓ Task: ${task.title}`);

      if (taskData.type !== TaskType.TASK2) {
        continue;
      }

      const themes = [
        {
          slug: 'environnement',
          name: 'Environnement',
        },
        {
          slug: 'education',
          name: 'Éducation',
        },
        {
          slug: 'sante',
          name: 'Santé',
        },
        {
          slug: 'famille',
          name: 'Famille',
        },
        {
          slug: 'enfants',
          name: 'Enfants',
        },
        {
          slug: 'alimentation',
          name: 'Alimentation',
        },
        {
          slug: 'activites',
          name: 'Activités',
        },
        {
          slug: 'mode-de-vie',
          name: 'Mode de vie',
        },
        {
          slug: 'travail',
          name: 'Travail',
        },
        {
          slug: 'societe',
          name: 'Société',
        },
      ];

      for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
        const themeData = themes[themeIndex];

        const theme = await db.theme.upsert({
          where: {
            moduleId_slug: {
              moduleId: module.id,
              slug: themeData.slug,
            },
          },
          update: {
            taskId: task.id,
            name: themeData.name,
            status: ContentStatus.PUBLISHED,
            sortOrder: themeIndex,
          },
          create: {
            moduleId: module.id,
            taskId: task.id,
            slug: themeData.slug,
            name: themeData.name,
            status: ContentStatus.PUBLISHED,
            sortOrder: themeIndex,
          },
        });

        console.log(`    ✓ Theme: ${theme.name}`);

        /*
         * Development sample topics.
         *
         * We are intentionally creating only a few records here.
         * The client's complete 40 topics should be imported separately
         * once the final content is available.
         */
        const topicByTheme: Record<
          string,
          {
            slug: string;
            title: string;
            situation: string;
          }
        > = {
          environnement: {
            slug: 'transports-ecologiques',
            title: 'Les transports écologiques',
            situation:
              'Vous cherchez des informations sur une solution de transport écologique.',
          },

          education: {
            slug: 'cours-de-francais',
            title: 'Cours de français',
            situation:
              'Vous souhaitez vous inscrire à un cours de français et obtenir des informations.',
          },

          sante: {
            slug: 'activite-sportive',
            title: 'Activité sportive',
            situation:
              'Vous souhaitez commencer une activité sportive dans votre quartier.',
          },
        };

        const topicData = topicByTheme[themeData.slug];

        if (!topicData) {
          continue;
        }

        await db.topic.upsert({
          where: {
            themeId_slug: {
              themeId: theme.id,
              slug: topicData.slug,
            },
          },

          update: {
            title: topicData.title,
            situation: topicData.situation,
            question:
              'Posez des questions sur les horaires, les conditions, le prix, le lieu et les modalités.',
            modelAnswer:
              'Bonjour, je souhaiterais obtenir quelques renseignements. Pourriez-vous me préciser les horaires et les conditions ? Et combien cela coûte-t-il ? Merci.',
            extraInformation:
              'Utilisez des formulations polies et relancez naturellement lorsque la réponse ouvre une nouvelle question.',
            conclusion:
              'Merci beaucoup pour toutes ces informations.',
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            sortOrder: 0,
          },

          create: {
            themeId: theme.id,
            slug: topicData.slug,
            title: topicData.title,
            situation: topicData.situation,
            question:
              'Posez des questions sur les horaires, les conditions, le prix, le lieu et les modalités.',
            modelAnswer:
              'Bonjour, je souhaiterais obtenir quelques renseignements. Pourriez-vous me préciser les horaires et les conditions ? Et combien cela coûte-t-il ? Merci.',
            extraInformation:
              'Utilisez des formulations polies et relancez naturellement lorsque la réponse ouvre une nouvelle question.',
            conclusion:
              'Merci beaucoup pour toutes ces informations.',
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            sortOrder: 0,
          },
        });

        console.log(`      ✓ Sample topic: ${topicData.title}`);
      }
    }
  }

  console.log('');
  console.log('========================================');
  console.log('🌱 platform seed completed');
  console.log('========================================');
  console.log(`Course: ${course.slug}`);
  console.log('Skills: 4');
  console.log('Speaking tasks: 3');
  console.log('Task 2 themes: 10');
  console.log('Sample Task 2 topics: 3');
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
