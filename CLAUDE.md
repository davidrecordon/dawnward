# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dawnward is a free, open-source jet lag optimization web app. It uses the Arcascope circadian library (Forger99 model) to generate personalized schedules for adapting to new timezones via light exposure, melatonin timing, and caffeine strategy.

## Commands

```bash
# Development
bun dev              # Start Next.js dev server (localhost:3000)
bun run build        # Production build
bun start            # Start production server

# Testing
bun run test         # Run Vitest in watch mode
bun run test:run     # Run all TypeScript tests once
bun run test:python  # Run all Python pytest tests

# Linting & Formatting
bun run lint         # Run ESLint (TypeScript)
bun run format       # Format with Prettier (auto-fix)
bun run format:check # Check formatting without fixing
bun run typecheck    # Run TypeScript type checking
bun run lint:python  # Check Python with ruff (lint + format)
bun run lint:python:fix  # Auto-fix Python issues
bun run typecheck:python # Run mypy type checking

# Database (Prisma)
bun prisma generate     # Generate Prisma client to src/generated/prisma
bun prisma migrate dev  # Run migrations in development
bun prisma studio       # Open Prisma Studio GUI
```

## Before Committing

**Always run linters and tests before committing changes:**

```bash
# TypeScript changes
bun run lint         # ESLint
bun run format:check # Prettier
bun run typecheck    # TypeScript
bun run test:run     # Vitest

# Python changes
bun run lint:python  # ruff check + format
bun run typecheck:python  # mypy
bun run test:python  # pytest
```

**For significant code changes**, use the code-simplifier skill to refine code for clarity and maintainability:

- Extracts magic numbers into named constants
- Simplifies logic and reduces nesting
- Improves naming consistency
- Removes redundancy

## Linting & Type Checking

| Language   | Linter   | Formatter   | Type Checker | Config                             |
| ---------- | -------- | ----------- | ------------ | ---------------------------------- |
| TypeScript | ESLint 9 | Prettier    | tsc          | `eslint.config.mjs`, `.prettierrc` |
| Python     | ruff     | ruff format | mypy         | `api/_python/pyproject.toml`       |

**ESLint** - Configured via `eslint-config-next` for Next.js best practices.

**Prettier** - Code formatter for JS/TS/CSS with Tailwind CSS plugin for class sorting.

**ruff** - Fast Python linter that replaces pylint, flake8, isort, and black. Runs both linting and formatting.

**mypy** - Static type checking for Python with strict settings (`strict_optional`, `disallow_untyped_defs`, `warn_return_any`).

## Tech Stack

- **Framework**: Next.js 16+ (App Router, React 19)
- **Auth**: NextAuth.js v5 with Google provider, JWT sessions (Phase 1 complete, Phase 2 adds Calendar)
- **Database**: Prisma Postgres with `@prisma/adapter-pg` driver adapter
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Python Runtime**: Vercel Python Functions for circadian model (Arcascope library)
- **Deployment**: Vercel with explicit `builds` config (Next.js + Python coexist via `vercel.json`)
- **Analytics**: Vercel Analytics (respects GPC and DNT privacy signals)
- **Testing**: Vitest for TypeScript, pytest for Python
- **Linting**: ESLint + Prettier for TypeScript, ruff + mypy for Python

## Architecture

### Directory Structure

```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── auth/         # Sign-in and error pages
│   ├── api/auth/     # NextAuth route handlers
│   ├── api/trips/    # Trip CRUD and sharing endpoints
│   ├── api/user/     # User preferences endpoint
│   ├── api/share/    # Shared trip lookup
│   ├── trip/[id]/    # DB-backed trip view
│   ├── s/[code]/     # Shared trip view (public)
│   ├── trips/        # User's trip history (auth required)
│   ├── settings/     # User preferences (auth required)
│   └── science/      # Science explainer page
├── components/
│   ├── ui/           # shadcn/ui components (Button, Card, Input, etc.)
│   ├── auth/         # Auth components (SignInButton, UserMenu, etc.)
│   └── schedule/     # Schedule display components
├── lib/              # Shared utilities (cn() for Tailwind class merging)
│   └── __tests__/    # Vitest unit tests for utilities
├── test/             # Test setup and configuration
├── types/            # TypeScript type definitions
└── generated/prisma/ # Prisma client (generated, do not edit)

api/_python/
├── circadian/              # Circadian schedule generation module
│   ├── scheduler_v2.py     # Phase-based scheduler
│   ├── types.py            # Data classes
│   ├── circadian_math.py   # Core math utilities
│   ├── science/            # Circadian science modules (PRC, markers, sleep pressure)
│   └── scheduling/         # Intervention planning (constraint filter, phase generator)
└── tests/                  # Python pytest tests

prisma/
├── schema.prisma     # Database schema (User, Account, Session models)
└── migrations/       # Database migrations

design_docs/
├── completed/        # Implemented features (archived)
├── exploration/      # Future ideas, rough scopes, cleanup notes
├── shovel_ready/     # Scoped and ready to implement
└── [*.md]            # Core reference docs (decisions, backend, auth, etc.)
```

### Key Patterns

**Import alias**: Use `@/*` for `src/*` imports (e.g., `@/lib/utils`, `@/components/ui/button`)

**UI Components**: Using shadcn/ui with Radix primitives. Components use `class-variance-authority` for variants and the `cn()` helper for class merging. Add new components with `bunx shadcn@latest add <component>` (use bunx, not npx).

**Auth Flow**: Progressive signup - anonymous users can generate schedules (saved to DB with `userId: null`), then sign in with Google to access trip history and preferences. Auth uses JWT sessions for Edge Runtime compatibility. Config is split: `auth.config.ts` (Edge-compatible) and `auth.ts` (with Prisma adapter).

**Trip Storage**: All trips are stored in the database via `SharedSchedule` model. localStorage is only used for form draft state. Trips can optionally be shared via short codes (`/s/abc123`).

### Database Schema (Key Tables)

**Auth (NextAuth.js):**

- `User` - id, email, name, image, preferences (wake/sleep times, melatonin/caffeine, intensity)
- `Account` - OAuth provider accounts (Google tokens, scopes)
- `Session` - Database sessions (though JWT strategy is used)
- `VerificationToken` - For email verification (future use)

**Trip Storage:**

- `SharedSchedule` - All trips (shared or not), with optional share code
  - `id` (cuid), `code` (nullable short code for sharing)
  - `userId` (nullable - null for anonymous users)
  - Schedule inputs: originTz, destTz, departure/arrival times, preferences
  - Metadata: routeLabel, viewCount, createdAt, lastViewedAt

**Planned:**

- `calendar_syncs` - Track Google Calendar event IDs for delete-and-replace sync

### Schedule Generation

Schedules are computed by Python functions using the Arcascope `circadian` library (Forger99 model). The scheduler uses a **phase-based model** (not calendar days) to properly handle flight timing:

- **Preparation** - Full days before departure
- **Pre-Departure** - Departure day, before flight (ends 3h before departure)
- **In-Transit** - On the plane (with sleep windows for 12+ hour flights)
- **Post-Arrival** - Arrival day, after landing
- **Adaptation** - Full days at destination

Key intervention types:

- `light_seek` / `light_avoid` - Light exposure windows
- `melatonin` - Optimal melatonin timing
- `caffeine_ok` / `caffeine_cutoff` / `caffeine_boost` - Caffeine strategy
- `sleep_target` / `wake_target` - Target sleep schedule
- `sleep_window` - In-flight sleep opportunities (for ultra-long-haul flights)

### MCP Interface

Public read-only JSON-RPC 2.0 endpoint at `POST /api/mcp` for AI assistants to query circadian science tools.

**Tools:**

- `calculate_phase_shift` - Quick timezone shift calculation (~100ms)
- `get_adaptation_plan` - Full schedule generation (~1-2s)

**Rate limited:** 100 requests/hour per IP. No auth required.

**Methods:**

- `tools/list` - Return available tool definitions
- `tools/call` - Execute a tool with arguments

**Files:**

- `src/app/api/mcp/route.ts` - JSON-RPC handler (TypeScript)
- `src/lib/mcp/types.ts` - Types and Zod schemas
- `src/lib/mcp/tool-definitions.ts` - Tool JSON schemas
- `src/lib/rate-limiter.ts` - Sliding window rate limiter
- `src/lib/ip-utils.ts` - IP extraction from headers
- `api/mcp/tools.py` - Vercel Python endpoint (internal, called by route.ts)
- `api/_python/mcp_tools.py` - Python tool implementations

## Security Considerations

**Trip Access Control:**

- Private trips (no share code) are only viewable by the owner
- Shared trips (`/s/[code]`) are publicly viewable
- `/trip/[id]` returns 404 for non-owners of unshared trips (prevents IDOR)

**API Authorization:**

- DELETE and share endpoints require authentication AND ownership
- Use consistent 404 responses to prevent enumeration attacks
- Share codes use `crypto.randomBytes()` for unpredictable generation

**Anonymous Users:**

- Can create trips (saved with `userId: null`)
- Cannot access trip history or share trips
- Anonymous trips need periodic cleanup (TODO: cron job)

## Environment Variables

Required:

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Session encryption key (Auth.js v5 uses AUTH_SECRET, not NEXTAUTH_SECRET)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials

Note: `NEXTAUTH_URL` is no longer required—Auth.js v5 infers the URL from request headers.

## Brand & UI Guidelines

**Voice & Tone**: Direct but warm. Explain the "why" briefly. Use plain language (not clinical jargon). Be specific with times ("9:30 PM" not "evening").

**Microcopy**: "Generate My Schedule" not "Submit", "Add to Calendar" not "Sync", "Sign in with Google" not "Login"

**Semantic Colors** (for intervention styling):

- Light interventions → Sunrise/amber `#F4A574`
- Caffeine → Sunset/orange `#E8B456`
- Melatonin → Sage/green `#7DBB9C`
- Sleep → Night/purple `#6B5BA3`
- Travel/flights → Sky blue `#3B9CC9`

**Icons** (Lucide): `Sun` for light, `Coffee` for caffeine, `Pill` for melatonin, `Moon` for sleep, `Plane` for travel

**Typography**: System font stack (`system-ui, -apple-system, sans-serif`). Body text is `text-slate-800`. Headings use `font-semibold` or `font-bold` with `tracking-tight`.

**Layout**: Mobile-first. Cards use white with `shadow-sm`, add `backdrop-blur-sm` over gradients. Border radius is `0.625rem` (the `--radius` CSS variable).

## Claude Code Skills

This project uses Claude Code plugins that should be invoked for significant work:

**`/frontend-design`** - Use when building or modifying UI components

- Designs distinctive, production-grade interfaces
- Ensures brand consistency (colors, typography, spacing)
- Avoids generic "AI slop" aesthetics

**`/feature-dev`** - Use when implementing new features

- Guided feature development with codebase understanding
- Explores existing patterns before writing code
- Asks clarifying questions, designs architecture, then implements
- Includes code review phase

**`code-simplifier`** - Use after completing significant work

- Reviews recently modified code for duplication and complexity
- Extracts shared utilities, consolidates patterns
- Removes dead code, simplifies conditionals
- Invoke via Task tool with `subagent_type: "code-simplifier:code-simplifier"`

**When to use them:**

- Building new components or pages → `/frontend-design`
- Implementing backend features, APIs, or complex logic → `/feature-dev`
- Small fixes, typos, or simple changes → No skill needed

**Before proposing to commit:** Always run `code-simplifier` after completing multi-file changes or new features. This catches duplication introduced during development and keeps the codebase clean. The workflow is: implement → tests pass → simplify → tests still pass → commit.

## Testing

**TypeScript (Vitest)**: ~360 tests covering utility functions and components

- `src/lib/__tests__/time-utils.test.ts` - Date/time formatting, timezone-aware operations
- `src/lib/__tests__/timezone-utils.test.ts` - Flight duration calculation, timezone shifts
- `src/lib/__tests__/airport-search.test.ts` - Search scoring, matching, filtering
- `src/lib/__tests__/intervention-utils.test.ts` - Intervention styling, time formatting
- `src/lib/__tests__/schedule-storage.test.ts` - Form state localStorage persistence
- `src/lib/__tests__/error-utils.test.ts` - Error message extraction
- `src/lib/__tests__/short-code.test.ts` - Share code generation
- `src/lib/__tests__/trip-status.test.ts` - Relative time labels ("in 2 days", "yesterday")
- `src/lib/__tests__/trip-utils.test.ts` - Trip data mapping utilities
- `src/lib/__tests__/auth-utils.test.ts` - Callback URL validation, auth utilities
- `src/lib/__tests__/form-defaults.test.ts` - Form default value handling
- `src/lib/__tests__/rate-limiter.test.ts` - Sliding window rate limiting
- `src/lib/schedule-utils.test.ts` - Schedule merging and sorting logic
- `src/app/api/schedule/generate/__tests__/route.test.ts` - API route data construction
- `src/app/api/user/preferences/__tests__/route.test.ts` - User preferences API
- `src/app/api/trips/__tests__/route.test.ts` - Trip CRUD and deduplication
- `src/components/__tests__/header.test.tsx` - Session-aware header rendering
- `src/components/__tests__/preferences-save-modal.test.tsx` - Preference save modal
- `src/components/auth/__tests__/sign-in-button.test.tsx` - Sign-in button variants
- `src/components/auth/__tests__/user-menu.test.tsx` - User menu, avatar initials
- `src/components/schedule/__tests__/day-section.test.tsx` - Schedule day section rendering
- `src/types/__tests__/user-preferences.test.ts` - User preference type validation

**Python (pytest)**: ~290 tests covering schedule generation (6-layer validation strategy)

- `test_model_parity.py` - CBTmin trajectory, phase shift magnitude, daily shift targets
- `test_physiological_bounds.py` - Max shift rates, antidromic risk, sleep duration, melatonin timing
- `test_prc_consistency.py` - Light/melatonin PRC alignment, avoidance zones
- `test_scenario_regression.py` - Canonical routes (Eastman/Burgess, Dean), adaptation timelines
- `test_edge_cases.py` - 12h shifts, extreme chronotypes, multi-leg trips, zero timezone change
- `test_realistic_flights.py` - Real airline routes (VS, BA, AF, SQ, CX) with actual departure/arrival times
- `test_sorting.py` - Intervention sorting, late-night handling, sleep_target near departure filtering
- `test_timezone_handling.py` - Phase timezone handling, is_in_transit flag
- `test_mcp_tools.py` - MCP tool implementations (phase shift, adaptation plan)
- `conftest.py` - Shared fixtures including `frozen_time` for deterministic date testing

**Time Mocking (Python)**: Uses `time-machine` for C-level time mocking that catches all `datetime.now()` calls including in dependencies like Arcascope. Tests with hardcoded dates use the `frozen_time` fixture (freezes to Jan 1, 2026). Tests needing flexibility use relative dates (`datetime.now() + timedelta(days=N)`).

## Design Documents

See `design_docs/` for detailed specifications:

```
design_docs/
├── completed/           # Implemented features (archived)
├── exploration/         # Future ideas, rough scopes, cleanup notes
├── shovel_ready/        # Scoped and ready to implement
│
├── decisions-overview.md    # All key decisions in one place
├── backend-design.md        # API routes, database schema, MCP tools
├── auth-design.md           # NextAuth.js setup, progressive signup flow
├── vercel-design.md         # Vercel deployment: Next.js + Python coexistence
├── testing-design.md        # 6-layer validation strategy
├── science-methodology.md   # Circadian science foundation
├── debugging-tips.md        # Scheduler debugging lessons learned
├── brand.md                 # Color, tone, and style guidelines
├── frontend-design.md       # Screen structure, components, user flows
├── ui-v2.html               # Static mockup of key screens
└── ui-v2-homepage-only.html # Homepage mockup (fits in context window)
```
