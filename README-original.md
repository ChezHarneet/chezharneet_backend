# ChezHarneet — Production Backend Blueprint

A production-oriented NestJS/Fastify + PostgreSQL + Prisma + Redis + BullMQ backend foundation for the TCF course platform described in the SRS and UI video.

## Architecture

- API: NestJS + Fastify
- DB: PostgreSQL + Prisma
- Cache / rate-limit / queues: Redis
- Background jobs: BullMQ
- OTP: hashed, expiring, attempt-limited; email delivery is asynchronous
- Media: S3-compatible object storage recommended
- WhatsApp: Meta WhatsApp Business Cloud API through a queue worker
- Future payments: provider webhook -> idempotent order state transition -> enrollment -> notification job

## Why this architecture

The UI shows a content-heavy hierarchy: Speaking -> Tasks -> Themes -> Topics, with detailed topic pages and reusable content sections. The database normalizes course structure while caching read-heavy public content in Redis. PostgreSQL remains the source of truth.

## Course structure

Published course navigation is exposed by `GET /api/courses/:slug/structure` and follows this hierarchy:

```text
Course
├── Speaking module
│   ├── Task 1: interview / personal information
│   ├── Task 2: interaction / information gathering
│   └── Task 3: viewpoint / argumentation
├── Listening module
│   ├── Task 1: messages
│   ├── Task 2: conversations
│   └── Task 3: interviews
└── Writing module
	├── Task 1: short message
	├── Task 2: article or letter
	└── Task 3: opinion text
```

Each skill is a `CourseModule` with its own exam label, duration and question count. Each task has an explicit `TaskFormat`, and its `PracticeSet` records whether the content is a normal practice set, recent subject, or full simulation. Listening questions can reference audio media, while speaking topics and writing prompts continue to use their task-specific content models. Reading is represented as a future-compatible skill but is not required for the current MVP.

## Heavy-load principles

1. Stateless API instances behind a load balancer.
2. PostgreSQL with indexes and connection pooling.
3. Redis cache-aside for published course/topic data.
4. BullMQ workers for email, WhatsApp, media processing and future imports.
5. Object storage/CDN for videos/PDFs; do not serve large files from Node.
6. Idempotent payment webhooks and notification jobs.
7. Rate limiting on OTP/auth endpoints.
8. Structured logs + metrics + tracing in production.
9. Read replicas can be added when PostgreSQL read traffic grows.
10. Cache invalidation on content publish/update.

## Local run

```bash
docker compose up -d
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

API: `http://localhost:4000/api`
Health: `GET /api/health`

## OAuth login

The login page supports Google and GitHub. Add the provider credentials to `.env`, then register these callback URLs with each provider:

- Google: `http://localhost:4000/api/auth/oauth/google/callback`
- GitHub: `http://localhost:4000/api/auth/oauth/github/callback`

Set `API_PUBLIC_URL`, `WEB_URL`, and `OAUTH_STATE_SECRET` for the deployed domains. OAuth users are matched by email and receive the same JWT as email OTP users.

## OTP flow

`POST /api/auth/otp/request` creates a hashed OTP and queues delivery. In the production implementation, the notification worker sends the email using SES/Resend/Postmark/SMTP. `POST /api/auth/otp/verify` validates expiry and attempt count and marks the OTP consumed.

Never log OTPs in production. The development response currently exposes `devCode` only when `NODE_ENV=development` so local testing is easy; remove this before production.

## WhatsApp purchase flow

1. Payment provider sends webhook.
2. Backend verifies webhook signature and amount/order state.
3. Transaction marks Order PAID and creates/activates Enrollment.
4. A BullMQ job is created for WhatsApp.
5. Worker sends an approved WhatsApp Business template.
6. Retries use exponential backoff.
7. NotificationLog should be persisted for audit/delivery status in the final implementation.

The customer must have an appropriate WhatsApp opt-in and the message/template must comply with Meta/WhatsApp Business policies. Do not send arbitrary promotional text as an unsolicited business-initiated message.

## Production hardening still required before launch

- Real email provider integration
- Persist NotificationLog in worker
- JWT guard + refresh-token rotation
- RBAC guards for admin/editor
- Payment provider integration and signed webhook verification
- S3 presigned URLs + CDN
- Observability (OpenTelemetry/Sentry/Prometheus)
- Automated tests and migrations in CI/CD
- Secrets manager
- DB backups/PITR
- WAF/load balancer
- Redis HA and PostgreSQL HA/replicas as scale requires
- Virus scanning for uploaded files
- Content moderation/validation for admin uploads
