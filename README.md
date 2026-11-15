# QUITIN

QUITIN is a professional social networking platform for developers, students, recruiters
and tech professionals — think LinkedIn, but focused on technology.

Users can build a professional profile, publish posts, like and comment, follow each
other, search for people and posts, exchange **real-time** private messages, chat with an
**AI assistant** and receive notifications.

The project is a monorepo with a clean separation between frontend and backend.

```
/quitin
├── backend      # NestJS REST API + Socket.IO gateway + Prisma/PostgreSQL
├── frontend     # Next.js (App Router) + TypeScript + Tailwind CSS
├── docker-compose.yml   # Local PostgreSQL
└── package.json         # Convenience scripts that delegate to each app
```

---

## Tech stack

| Layer         | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Frontend      | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS       |
| Backend       | NestJS 10, TypeScript, REST, Socket.IO                            |
| Database      | PostgreSQL + Prisma ORM                                           |
| Auth          | JWT stored in **HTTP-only cookies**, bcrypt password hashing      |
| Validation    | `class-validator` / `class-transformer` (backend), client checks  |
| Tests         | Jest (backend unit), Playwright (E2E)                             |
| AI            | Any OpenAI-compatible Chat Completions API (configurable)         |

---

## Features

- **Authentication** — register, login, logout, remember me, HTTP-only cookie sessions.
- **Profiles** — avatar upload, bio, headline, location, company, website, skills,
  experience and education.
- **Posts** — create, delete, like (optimistic), comment, delete comments.
- **Social graph** — follow / unfollow, followers & following lists, suggestions.
- **Search** — people (username, headline, bio, skills) and posts.
- **Messaging** — conversation list, chat window, real-time delivery via Socket.IO,
  read receipts, unread badges.
- **AI assistant** — conversation history, persisted messages, configurable provider.
- **Notifications** — likes, comments, follows, messages; unread count; mark as read.
- **Settings** — edit profile, manage experience and education.

---

## Getting started

### One-command development environment (Windows)

If PostgreSQL is installed locally (native Windows service) and the dependencies
are installed, the whole stack starts with a single command from the project root:

```powershell
npm run dev:up
```

`dev:up` checks the environment, starts PostgreSQL if it is stopped, verifies the
`quitin` database, generates the Prisma Client when needed, then starts the
backend and frontend and waits until both are healthy. It never kills unrelated
processes and never deletes data.

| Command                | What it does                                                                 |
| ---------------------- | ---------------------------------------------------------------------------- |
| `npm run dev:check`    | Read-only audit: tools, dependencies, env vars, PostgreSQL, Prisma, ports.    |
| `npm run dev:up`       | Start PostgreSQL (if needed) + backend + frontend, with health checks.        |
| `npm run dev:down`     | Stop only the QUITIN backend/frontend. PostgreSQL stays running.             |
| `npm run dev:status`   | Show PostgreSQL, database, Prisma, backend, frontend and port status.        |
| `npm run dev:logs`     | Show the backend/frontend logs (add `-- -Service backend -Follow`).          |
| `npm run dev:up -- -Prod` | Production-like run (builds first, then `next start` / `node dist`).      |

Useful details:

- Ports: PostgreSQL `5432`, backend `4000`, frontend `3000`.
- If a QUITIN service is already running on a port, it is reused instead of
  starting a duplicate.
- If another application owns a required port, the manager stops with an
  explanation and the PID; it never kills it.
- Logs are written to `.logs/`, manager state to `.run/` (both git-ignored).
- PostgreSQL is stopped only when explicitly requested:
  `npm run dev:down -- -WithPostgres`.
- `START.bat` is a double-click wrapper around `npm run dev:up`.

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ (native Windows service on port 5432, or Docker)

### 1. Install dependencies

```bash
npm run install:all
# or: cd backend && npm install   /   cd frontend && npm install
```

### 2. Start PostgreSQL

The recommended setup is one native PostgreSQL instance on `127.0.0.1:5432`
with a database named `quitin`. `npm run dev:up` starts the Windows service if
it is stopped, and creates the database only when it does not exist.

With Docker instead (stop the native service first to avoid a port conflict):

```bash
npm run db:up
```

Or point `DATABASE_URL` at your own PostgreSQL instance.

### 3. Configure the backend environment

Copy `backend/.env.example` to `backend/.env` and adjust the values:

```env
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/quitin?schema=public"
JWT_SECRET="a-long-random-secret"
JWT_EXPIRES_IN="7d"
COOKIE_NAME="quitin_token"
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
PORT=4000

# AI assistant (OpenAI-compatible). Leave AI_API_KEY empty to disable live answers.
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY=""
AI_MODEL="gpt-4o-mini"
```

The backend validates these values at startup. A missing `DATABASE_URL` or
`JWT_SECRET` produces a readable error instead of a Prisma stack trace.

### 4. Run migrations and seed

`npm run dev:up` already generates the Prisma Client and applies the schema when
the database is empty. To do it manually:

```bash
npm run prisma:generate     # generate the Prisma client
npm run prisma:push         # create/update the schema (prisma db push)
npm run prisma:seed         # optional demo data
```

> This repository has no `prisma/migrations` folder: the schema is managed with
> `prisma db push`. `npm run prisma:migrate` only makes sense if you decide to
> adopt Prisma migrations later.

Demo accounts created by the seed (password: `Password123!`):

| Email             | Username |
| ----------------- | -------- |
| ada@quitin.dev    | ada      |
| linus@quitin.dev  | linus    |
| grace@quitin.dev  | grace    |

### 5. Run the apps

Recommended:

```bash
npm run dev:up       # PostgreSQL + backend + frontend, with health checks
npm run dev:status   # verify everything
npm run dev:down     # stop backend and frontend
```

Or run the two apps in separate terminals:

```bash
npm run dev:backend     # http://localhost:4000/api
npm run dev:frontend    # http://localhost:3000
```

The frontend proxies `/api/*` and `/uploads/*` to the backend (see
`frontend/next.config.mjs`), so authentication cookies stay same-origin.

Backend health endpoint: `GET http://localhost:4000/api/health` (returns `200`
when the API and database are reachable, `503` otherwise).

---

## Environment variables

### Backend (`backend/.env`)

| Variable        | Description                                                    |
| --------------- | ------------------------------------------------------------- |
| `DATABASE_URL`  | PostgreSQL connection string.                                  |
| `JWT_SECRET`    | Secret used to sign session JWTs. **Change in production.**    |
| `JWT_EXPIRES_IN`| Token lifetime (e.g. `7d`).                                    |
| `COOKIE_NAME`   | Name of the auth cookie.                                       |
| `NODE_ENV`      | `development` or `production` (enables `secure` cookies).      |
| `FRONTEND_URL`  | Allowed CORS origin.                                           |
| `PORT`          | API port (default `4000`).                                     |
| `AI_BASE_URL`   | OpenAI-compatible base URL.                                    |
| `AI_API_KEY`    | API key for the AI provider (empty disables live answers).     |
| `AI_MODEL`      | Model name.                                                    |

### Frontend (`frontend/.env.local`)

| Variable                 | Description                              |
| ------------------------ | ---------------------------------------- |
| `BACKEND_URL`            | Backend origin for the API proxy.        |
| `NEXT_PUBLIC_SOCKET_URL` | Backend origin for the Socket.IO client. |

---

## Security notes

- Passwords are hashed with **bcrypt** (cost 12) and never returned by the API.
- Sessions use **HTTP-only, SameSite=Lax** cookies — no tokens in `localStorage`.
- All inputs are validated with `class-validator`; unknown fields are stripped.
- A global JWT guard protects every route; opt out explicitly with `@Public()`.
- Ownership checks prevent modifying other users' posts, comments, profile data and
  conversations; message access requires conversation participation.
- Rate limiting via `@nestjs/throttler` (stricter limits on auth endpoints).
- Uploads are restricted to images ≤ 5 MB.
- Secrets and API keys come from environment variables only.

---

## Testing

### Backend unit tests (Jest)

```bash
npm run test:backend
```

### End-to-end tests (Playwright)

```bash
cd frontend
npx playwright install chromium   # first time only
npm run test:e2e
```

The default suite (`frontend/e2e/smoke.spec.ts`) exercises the frontend in isolation.
A full-stack auth flow test is included in `frontend/e2e/auth.spec.ts`; enable it with the
backend running and seeded:

```bash
# PowerShell
$env:E2E_FULL_STACK="1"; npm run test:e2e
```

---

## API overview

| Area          | Endpoints                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| Health        | `GET /health` (public, reports API + database status)                      |
| Auth          | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Users         | `GET /users/:username`, `/users/search`, `/users/suggestions`, `PATCH /users/me/profile`, `*/me/experiences`, `*/me/educations`, `POST /users/:username/follow` |
| Posts         | `GET/POST /posts`, `GET/DELETE /posts/:id`, `POST /posts/:id/like`, `GET/POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId`, `GET /posts/search` |
| Conversations | `GET/POST /conversations`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/read` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` |
| AI            | `GET/POST /ai/conversations`, `GET/DELETE /ai/conversations/:id`, `POST /ai/conversations/:id/messages` |
| Upload        | `POST /upload/avatar`                                                     |

### Socket.IO events

| Event                    | Direction        | Purpose                                  |
| ------------------------ | ---------------- | ---------------------------------------- |
| `conversation:join`      | client → server  | Join a conversation room.                |
| `message:send`           | client → server  | Send a message.                          |
| `message:read`           | client → server  | Mark a conversation as read.             |
| `message:new`            | server → client  | New message in a joined conversation.    |
| `conversation:updated`   | server → client  | Conversation list refresh (personal room).|
| `conversation:read`      | server → client  | A participant read the conversation.     |

Sockets authenticate from the same HTTP-only cookie during the handshake.
