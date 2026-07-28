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

## Testing

_To be added — vitest (unit + integration with supertest) is the planned setup._
