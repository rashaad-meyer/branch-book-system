# Branch Appointment Booking System

A system for customers to schedule branch appointments with simulated confirmations.
Guests book without an account and manage their booking with an unguessable reference
code; branch staff log in to view and manage their branch's schedule.

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

## API

Base path `/api/v1`. Public endpoints serve the guest booking flow; staff endpoints
require a Bearer JWT from `/auth/login`.

| Method | Path                              | Auth  | Description                               |
| ------ | --------------------------------- | ----- | ----------------------------------------- |
| GET    | `/health`                         | —     | Liveness + DB connectivity                |
| GET    | `/branches`                       | —     | List branches                             |
| GET    | `/branches/:id/availability`      | —     | Open slots for `?serviceId=&date=`        |
| POST   | `/appointments`                   | —     | Book a slot (`Idempotency-Key` supported) |
| GET    | `/appointments/:reference`        | —     | Look up a booking by reference            |
| POST   | `/appointments/:reference/cancel` | —     | Cancel a booking by reference             |
| POST   | `/auth/login`                     | —     | Staff login → JWT                         |
| GET    | `/me`                             | staff | Authenticated staff profile               |
| GET    | `/staff/schedule?date=`           | staff | Own branch's appointments for a day       |
| POST   | `/staff/appointments/:id/cancel`  | staff | Cancel an appointment at own branch       |

Errors use a consistent envelope: `{ "error": { "code", "message", "details?" } }`.

## Design decisions

**Double-booking is prevented by the database, not the application.** Appointments carry a
Postgres GiST **exclusion constraint** (`btree_gist`): no two non-cancelled rows for the same
branch may have overlapping `tstzrange(startsAt, endsAt)` windows. Two concurrent requests for
the last slot can both pass every application-level check; the insert is the arbiter — one
commits, the other receives the constraint violation and a `409 SLOT_TAKEN`. This holds across
any number of API instances because the invariant lives in the database. An application-level
check alone has a TOCTOU race; it exists only to give friendly errors early. The constraint is
added in raw SQL inside the migration (Prisma's DSL cannot express `EXCLUDE`), alongside CHECK
guards (`endsAt > startsAt`, positive durations) that keep degenerate ranges from slipping
past the overlap test. Cancelled rows are excluded via a partial index predicate, so
cancelling frees the slot with no delete.

**Slots are computed, not stored.** Availability = branch operating hours − existing
appointments, derived on demand by a pure, unit-tested calculator. No slot rows to
pre-generate, no cron, no stale state. The availability query mirrors the constraint's
predicate exactly (overlap window + `status <> CANCELLED`); the constraint guarantees
correctness, the query merely predicts it.

**Times are stored in UTC (`timestamptz`), converted at the edges.** Each branch carries an
IANA timezone; operating hours are branch-local wall times converted per request. Weekday
resolution and window math are covered by tests including DST-observing zones.

**Guests book without accounts.** The booking returns a high-entropy reference (10 chars,
unambiguous alphabet, ~49 bits) that acts as the authorization token for lookup and
cancellation — like an airline PNR. Consequences owned: the reference must be unguessable,
lookup endpoints are rate limited against enumeration, and there is no "my appointments" list
(deliberate cut, below).

**Bookings are idempotent.** An optional `Idempotency-Key` header makes retries safe over
flaky connections: a repeated key replays the original response instead of double-booking;
the same key with a different payload is rejected.

**One state machine, multiple entry points.** `CONFIRMED → CANCELLED` is the only transition,
enforced by a guarded conditional update so concurrent cancels cannot both succeed. Guest
cancel (by reference) and staff cancel (by id, scoped to own branch) share the same core.

**Notifications are simulated behind a seam.** The brief asks for a _simulated_ confirmation:
a `Notifier` interface with a console implementation logs the confirmation/cancellation
"email". A real provider would implement the same interface, fed by an outbox table so
delivery retries independently of the booking transaction — booking success is never coupled
to notification success.

**Deliberate scope cuts** (extension paths known): customer accounts and booking history;
outbox-backed delivery; refresh tokens / password reset; multiple concurrent desks per branch
(the exclusion constraint would gain a `desk_id` column); shared rate-limit store for
multi-instance deployments (currently per-instance memory); appointment rescheduling.

## Security notes

- zod validation on every input boundary; Prisma parameterizes all queries
- bcrypt password hashing; constant-cost login (dummy compare) avoids account-existence
  timing leaks; JWTs expire after 1h
- rate limits: login (brute force), booking (abuse), reference lookup (enumeration)
- helmet, CORS allowlist, 100kb JSON body cap, `x-powered-by` disabled
- authorization-header redaction in request logs; no PII in log lines
- staff can only see/cancel their own branch (scoping from the JWT, never client input);
  foreign appointments are indistinguishable from nonexistent ones
- server derives `endsAt` from the service duration — clients cannot claim windows

## Testing

Server tests run with [vitest](https://vitest.dev):

```bash
npm test                              # from the root
npm run test:watch --workspace server # watch mode
```

The suite (49 tests, ~92% line coverage via `npm run test:coverage --workspace server`)
combines unit tests for the availability calculator with supertest integration tests
against the real compose Postgres — deliberately unmocked, since the exclusion
constraint is the system under test. Highlights: the concurrent same-slot race
(exactly one 201, one 409), idempotent replay under racing duplicates,
cancel-then-rebook freeing a slot, staff branch isolation, and rate-limit 429s.
Integration tests require the database: `npm run db:up` first.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, tests
against a Postgres service container, the workspace builds, and the Docker image build
on every PR.
