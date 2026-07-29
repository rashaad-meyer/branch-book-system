# Branch Appointment Booking System

A system for customers to schedule branch appointments with simulated confirmations.

## Stack

- **Backend:** Node.js, Express 5, TypeScript, Prisma, PostgreSQL
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4
- **Tooling:** npm workspaces, ESLint (type-checked), Prettier, Docker Compose

## Project structure

```
.
├── client/          # React frontend (Vite + Tailwind)
├── server/          # Express API (TypeScript + Prisma)
│   └── prisma/      # Prisma schema and migrations
└── docker-compose.yml   # PostgreSQL for local development
```

## Getting started

Prerequisites: Node.js >= 20, Docker.

```bash
# 1. Install dependencies (root — installs both workspaces)
npm install

# 2. Start PostgreSQL
npm run db:up

# 3. Set up the server environment
#    server/.env is already configured for the compose database;
#    see server/.env.example for the expected variables.

# 4. Generate the Prisma client
npm run prisma:generate --workspace server

# 5. Run both apps (server on :4000, client on :5173)
npm run dev
```

The client dev server proxies `/api/*` to the backend, so the frontend calls relative URLs.

## Running with Docker

The API ships as a multi-stage image ([server/Dockerfile](server/Dockerfile), built from the
repo root because of npm workspaces). Compose orchestrates the full backend:

```bash
docker compose up --build -d api   # db → migrate (one-shot) → api on :4000
docker compose run --rm migrate npx prisma db seed   # optional: seed demo data
curl http://localhost:4000/api/v1/health
docker compose down                # stop everything
```

`migrate` applies pending Prisma migrations and exits before the API starts, so a fresh
checkout boots to a working system with one command. `JWT_SECRET` and `CORS_ORIGIN` have
dev defaults in the compose file — override them via environment variables for anything
beyond local use.

## Scripts (run from the root)

| Script              | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Run server and client together  |
| `npm run build`     | Build both workspaces           |
| `npm run lint`      | Lint both workspaces            |
| `npm run typecheck` | Typecheck both workspaces       |
| `npm run format`    | Format everything with Prettier |
| `npm run db:up`     | Start the PostgreSQL container  |
| `npm run db:down`   | Stop the PostgreSQL container   |
| `npm test`          | Run the server test suite       |

## Testing

Server tests run with [vitest](https://vitest.dev):

```bash
npm test                              # from the root
npm run test:watch --workspace server # watch mode
```

Current coverage: unit tests for the availability calculator (slot generation,
overlap/adjacency semantics, closing-time fit, past-slot filtering, and
branch-local → UTC timezone conversion). Integration tests (supertest against
the API, including the concurrent double-booking race) are planned.
