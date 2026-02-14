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
bun run test:e2e     # Run Playwright E2E tests
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

# Scripts
npx tsx scripts/regenerate-schedules.ts --help  # Show help for schedule regeneration
```

## Scripts

### `scripts/regenerate-schedules.ts`

Regenerates stored schedules in the database by re-running the Python scheduler. Use this after schema changes to intervention data (e.g., adding new fields like timezone enrichment).

```bash
# Show help
npx tsx scripts/regenerate-schedules.ts --help
npx tsx scripts/regenerate-schedules.ts         # No args also shows help

# Regenerate modes
npx tsx scripts/regenerate-schedules.ts --all-trips       # All future trips
npx tsx scripts/regenerate-schedules.ts --user=<userId>   # All future trips for user
npx tsx scripts/regenerate-schedules.ts --trip=<tripId>   # Specific trip (any date)

# Options
--dry-run        # Preview without saving
--verbose, -v    # Show detailed output
--include-past   # Include past trips (for --all-trips and --user)
--reset-initial  # Also update initialScheduleJson (default: only currentScheduleJson)
```

**What it does:**

- Fetches `SharedSchedule` records matching the filter criteria
- Re-runs the Python scheduler with the original trip parameters
- Updates `currentScheduleJson` with the new output (use `--reset-initial` to also update `initialScheduleJson`)
- Validates that new schedules have expected fields before saving
- By default, only processes future trips (trips with any intervention date >= today)

**When to use:**

- After adding new fields to the `Intervention` type that the Python scheduler now generates
- After fixing bugs in the scheduler that affected stored schedules
- To migrate legacy schedules to a new format

**Requirements:** Requires `DATABASE_URL` environment variable (uses `.env` automatically).

### `scripts/calendar.ts`

Manage Google Calendar sync: preview events, sync to calendar, and check OAuth tokens.

```bash
npx tsx scripts/calendar.ts <trip-id>               # Preview events (dry-run)
npx tsx scripts/calendar.ts <trip-id> --sync        # Sync to Google Calendar
npx tsx scripts/calendar.ts <trip-id> --check-auth  # Check/refresh OAuth token
npx tsx scripts/calendar.ts --user=<userId> --check-auth  # Check auth for a user
npx tsx scripts/calendar.ts --preset=VS20           # Use preset flight for preview
```

**Modes:**

- **Preview (default):** Shows grouped calendar events, titles, times, durations
- **Sync:** Creates/updates events in Google Calendar (`--sync`, `--resync`, `--delete`)
- **Auth check:** Validates OAuth token, refreshes if expired (`--check-auth`)

**Available presets:**

- Minimal: HA11 (Hawaii 2h), AA16 (domestic 3h)
- Moderate: VS20, VS19, AF83, LH455 (transatlantic 8-9h)
- Severe: EK226 (Dubai), SQ31, SQ32 (Singapore), CX879, CX872 (Hong Kong), JL1, JL2 (Tokyo), QF74, QF73 (Sydney)

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

## Database Changes

When modifying `prisma/schema.prisma`:

1. **Always create migrations** — Run `bun prisma migrate dev --name <description>` after schema changes
2. **Never use `prisma db push` for persistent changes** — It syncs the database but doesn't create migration files
3. **Verify migration exists** — Check that `prisma/migrations/` has a new folder with your changes before committing

Without migrations, schema changes work locally but fail in production and for new developers.

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
- **Auth**: NextAuth.js v5 with Google provider, JWT sessions, Google Calendar scope for schedule sync
- **Database**: Prisma Postgres with `@prisma/adapter-pg` driver adapter
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Python Runtime**: Vercel Python Functions for circadian model (Arcascope library)
- **Deployment**: Vercel with explicit `builds` config (Next.js + Python coexist via `vercel.json`)
- **Analytics**: Vercel Analytics (respects GPC and DNT privacy signals)
- **Testing**: Vitest for TypeScript, pytest for Python, Playwright for E2E (Desktop: Chromium + WebKit, Mobile: Pixel 7 + iPhone 15 Pro)
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

scripts/
├── regenerate-schedules.ts  # Migrate stored schedules after schema changes
└── calendar.ts              # Calendar sync, preview, and OAuth token management
```

### Key Patterns

**Import alias**: Use `@/*` for `src/*` imports (e.g., `@/lib/utils`, `@/components/ui/button`)

**UI Components**: Using shadcn/ui with Radix primitives. Components use `class-variance-authority` for variants and the `cn()` helper for class merging. Add new components with `bunx shadcn@latest add <component>` (use bunx, not npx).

**Auth Flow**: Progressive signup - anonymous users can generate schedules (saved to DB with `userId: null`), then sign in with Google to access trip history and preferences. Auth uses JWT sessions for Edge Runtime compatibility. Config is split: `auth.config.ts` (Edge-compatible) and `auth.ts` (with Prisma adapter).

**Trip Storage**: All trips are stored in the database via `SharedSchedule` model. localStorage is only used for form draft state. Trips can optionally be shared via short codes (`/s/abc123`).

**Intervention Sorting**: Interventions sort by `dest_time` using `toSortableMinutes()`. Special cases:

- `sleep_target` at 00:00-05:59 sorts as "late night" (end of day, after 23:59)
- `wake_target` at 00:00-05:59 sorts as "early morning" (start of day)
- In-transit items with `flight_offset_hours` sort by offset, not time

**Schedule View Modes**: Viewport-driven behavior (no user preference):

- **Desktop**: All days start expanded showing full `DaySection` detail view.
- **Mobile**: All days start collapsed showing `DaySummaryCard`. Today's day auto-expands. Users can expand/collapse individual days.

**Minimal Shift Tips**: For small timezone shifts (≤2 hours), the schedule view shows a `MinimalShiftTips` card by default instead of the full day-by-day schedule. Users can click "View full schedule" to see the detailed timeline. The 2-hour threshold is defined by `MINIMAL_SHIFT_THRESHOLD_HOURS` in `timezone-utils.ts`. The `ScheduleResponse` includes `shift_magnitude` (rounded absolute hours) and `is_minimal_shift` (boolean) to control this behavior.

The `DaySummaryCard` component shows:

- Icon + time + personalized summary per intervention (generated by Python scheduler)
- Falls back to static condensed descriptions for older schedules without `summary` field
- Flight Day splits into sub-sections: Before Boarding, On the Plane, After Landing
- "View details" button expands to show full timeline
- "Summarize" pill collapses back to summary view

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

**Google Calendar:**

- `CalendarSync` - Tracks synced trips with background sync status
  - `googleEventIds` - Array of created Google Calendar event IDs
  - `status` - "syncing" | "completed" | "failed" (for background sync)
  - `startedAt` - When sync started (for stale timeout detection)
  - `eventsCreated` / `eventsFailed` - Success/failure counts
  - `errorCode` - "token_revoked" | "rate_limit" | "network" | etc.
  - `errorMessage` - Human-readable error description
- Background sync with `waitUntil()` from `@vercel/functions`
- One-way push with delete-and-replace strategy
- Anchor-based event grouping reduces ~20 events to ~10 per trip
- Events use IANA timezones from intervention data (origin_tz for pre-flight, dest_tz for post-flight)
- 5-minute stale sync timeout treats stuck syncs as failed

### Schedule Generation

Schedules are computed by Python functions using the Arcascope `circadian` library (Forger99 model). The scheduler uses a **phase-based model** (not calendar days) to properly handle flight timing:

- **Preparation** - Full days before departure
- **Pre-Departure** - Departure day, before flight (ends 3h before departure)
- **In-Transit** - On the plane (full-flight sleep for overnight red-eyes, dual windows for 12+ hour flights)
- **Post-Arrival** - Arrival day, after landing
- **Adaptation** - Full days at destination

Key intervention types:

- `light_seek` / `light_avoid` - Light exposure windows
- `melatonin` - Optimal melatonin timing
- `caffeine_ok` / `caffeine_cutoff` / `caffeine_boost` - Caffeine strategy
- `sleep_target` / `wake_target` - Target sleep schedule
- `nap_window` - In-flight sleep opportunities (overnight red-eyes and ultra-long-haul flights)

### Intervention Timezone Architecture

Each `Intervention` carries complete timezone context - no external lookups needed:

```typescript
interface Intervention {
  type: InterventionType;
  title: string;
  description: string;

  // Dual timezone times (required)
  origin_time: string; // HH:MM in origin timezone
  dest_time: string; // HH:MM in destination timezone
  origin_date: string; // YYYY-MM-DD in origin timezone
  dest_date: string; // YYYY-MM-DD in destination timezone
  origin_tz: string; // IANA timezone (e.g., "America/Los_Angeles")
  dest_tz: string; // IANA timezone (e.g., "Europe/London")

  // Phase info
  phase_type: PhaseType; // "preparation" | "pre_departure" | "in_transit" | "post_arrival" | "adaptation"
  show_dual_timezone: boolean; // Backend hint for dual display

  // Optional fields
  duration_min?: number;
  flight_offset_hours?: number; // For in-flight sleep windows only
  original_time?: string; // HH:MM - circadian-optimal time when capped (e.g., wake capped to pre-landing)
  summary?: string; // One-line personalized summary for collapsed card view (generated by Python scheduler)
}
```

**Display logic by phase** (use `getDisplayTime()` helper):

| Phase           | Primary Time | Secondary Time                | Rationale                              |
| --------------- | ------------ | ----------------------------- | -------------------------------------- |
| `preparation`   | origin_time  | dest_time (if dual enabled)   | User is at home                        |
| `pre_departure` | origin_time  | dest_time (if dual enabled)   | User is at origin airport              |
| `in_transit`    | dest_time    | origin_time (if dual enabled) | User adapting to destination           |
| `post_arrival`  | dest_time    | _none_                        | User has arrived, origin time is noise |
| `adaptation`    | dest_time    | _none_                        | User is at destination                 |

**Key rules:**

- Never use a legacy `time` field - it was removed. Always use `origin_time`/`dest_time`
- `is_in_transit` is on `DaySchedule`, not `Intervention`
- `flight_offset_hours` distinguishes in-flight sleep windows from ground naps
- `original_time` is set when wake/sleep targets are capped (e.g., wake capped to 1h before landing)
- `summary` is a personalized one-liner for collapsed card views (e.g., "Bright light for 60 min", "Target wake — get light after"). Generated by the Python scheduler with full circadian context. Falls back to static `CONDENSED_DESCRIPTIONS` map for older schedules.
- DST handling: Node.js may return "GMT+1" instead of "BST" for British Summer Time

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

### Google Calendar Integration

Push schedule interventions to user's Google Calendar with one-click sync.

**Files:**

- `src/app/api/calendar/sync/route.ts` - Sync endpoint (POST starts background sync, GET polls status, DELETE removes)
- `src/app/api/calendar/verify/route.ts` - Verify token has calendar scope with Google tokeninfo
- `src/lib/google-calendar.ts` - Event building, grouping, and Calendar API wrapper
- `src/lib/token-refresh.ts` - OAuth token refresh for scripts and background jobs

**API Routes:**

```
POST   /api/calendar/sync          → Start background sync (returns immediately)
GET    /api/calendar/sync?tripId=X → Check sync status (for polling)
DELETE /api/calendar/sync?tripId=X → Remove events from calendar
GET    /api/calendar/verify        → Verify token has calendar scope
```

**Event Density Optimization:**

Anchor-based grouping reduces calendar clutter (~20 events → ~10 per trip):

- Interventions within 2h of `wake_target` grouped as "Morning routine: Light + Caffeine"
- Interventions within 2h of `sleep_target` grouped as "Evening routine: Melatonin"
- Standalone types (never grouped): `caffeine_cutoff`, `exercise`, `nap_window`, `light_avoid`
- Grouped events use the longest duration among their interventions

**Timezone Handling:**

- Pre-flight events use `origin_tz` and `origin_date`
- Post-flight events use `dest_tz` and `dest_date`
- Google Calendar receives proper IANA timezone for each event

**Configuration:** See `design_docs/exploration/configuration-audit.md` for all calendar constants.

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

**`vercel-react-best-practices`** - Use when reviewing or optimizing React/Next.js code

- Performance optimization guidelines from Vercel Engineering
- Covers 8 categories: waterfalls, bundle size, server-side, client-side, re-renders, rendering, JS perf, advanced patterns
- Key patterns: `Promise.all()` for parallel fetches, `next/dynamic` for code splitting, `startTransition` for non-urgent updates, `useMemo` for expensive computations
- Invoke via Skill tool when asked to review or optimize React code

**When to use them:**

- Building new components or pages → `/frontend-design`
- Implementing backend features, APIs, or complex logic → `/feature-dev`
- Reviewing or optimizing React/Next.js performance → `vercel-react-best-practices`
- Small fixes, typos, or simple changes → No skill needed

**Before proposing to commit:** Always run `code-simplifier` after completing multi-file changes or new features. This catches duplication introduced during development and keeps the codebase clean. The workflow is: implement → tests pass → simplify → tests still pass → commit.

## Browser Testing with Chrome

Claude has access to Chrome via MCP tools for visual testing and iteration. **Use this proactively** when building UI components.

**Workflow:**

1. Start the dev server: `bun dev &` (runs in background)
2. Use `mcp__claude-in-chrome__tabs_context_mcp` to get browser context
3. Navigate to pages with `mcp__claude-in-chrome__navigate`
4. Take screenshots with `mcp__claude-in-chrome__computer` (action: "screenshot")
5. Interact with elements (click, scroll, type) to test functionality

**When to use:**

- Building new UI components → Create a demo page, view it in Chrome, iterate visually
- Debugging layout issues → Screenshot the problem area
- Verifying fixes → Reload and screenshot to confirm
- Testing interactions → Click buttons, expand/collapse, verify behavior

## Feature Design & Prototyping Workflow

For new UI features, follow this iterative workflow:

### 1. Design Exploration

- Create a design doc in `design_docs/exploration/` to capture requirements
- Ask clarifying questions to understand user needs (view mode, content level, integration points)
- Document decisions as they're made

### 2. Build a Prototype

- Create a demo page at `src/app/demo/<feature>/page.tsx` with mock data
- Use `/frontend-design` skill for component implementation
- Start dev server and iterate visually in Chrome
- Get user feedback, make adjustments

### 3. Code Review

- Run `feature-dev:code-reviewer` for bugs, logic errors, type safety, accessibility
- Run a second review for design quality (brand consistency, spacing, colors)
- Fix issues identified by reviewers

### 4. Implementation Plan

- Update design doc with full implementation plan (files to modify, code snippets, test cases)
- Move doc from `exploration/` to `shovel_ready/` when ready
- Include dependencies, risks, and open questions

**Example demo page pattern:**

```typescript
// src/app/demo/my-feature/page.tsx
"use client";

import { useState } from "react";
import { MyComponent } from "@/components/my-component";

// Mock data that exercises all component states
const mockData = { /* ... */ };

export default function MyFeatureDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 to-violet-100 p-8">
      <h1>MyComponent Demo</h1>
      <MyComponent data={mockData} />
    </div>
  );
}
```

**Key lessons:**

- Always view components in browser before considering them done
- Mock data should cover edge cases (empty states, long text, all variants)
- Demo pages are temporary—delete them before merging to main
- Export component prop interfaces for testability and reuse

## Testing

**TypeScript (Vitest)**: ~525 tests covering utility functions and components

- `src/lib/__tests__/time-utils.test.ts` - Date/time formatting, timezone-aware operations
- `src/lib/__tests__/timezone-utils.test.ts` - Flight duration calculation, timezone shifts, prep days recommendations
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
- `src/components/__tests__/display-preferences-context.test.tsx` - Display preferences context and hooks
- `src/components/auth/__tests__/sign-in-button.test.tsx` - Sign-in button variants
- `src/components/auth/__tests__/user-menu.test.tsx` - User menu, avatar initials
- `src/components/schedule/__tests__/day-section.test.tsx` - Schedule day section rendering
- `src/components/schedule/__tests__/day-summary-card.test.tsx` - Summary card rendering, flight day sub-sections, expand/collapse, personalized summary fallback
- `src/components/schedule/__tests__/minimal-shift-tips.test.tsx` - Minimal shift tips card, toggle states
- `src/components/schedule/__tests__/intervention-card.test.tsx` - Intervention card rendering, dual timezone display
- `src/components/schedule/__tests__/inflight-sleep-card.test.tsx` - In-flight sleep card, flight offset display
- `src/lib/__tests__/google-calendar.test.ts` - Calendar event building, anchor-based grouping, reminder timing, duration calculations
- `src/types/__tests__/user-preferences.test.ts` - User preference type validation

**Python (pytest)**: ~345 tests covering schedule generation (6-layer validation strategy)

- `test_model_parity.py` - CBTmin trajectory, phase shift magnitude, daily shift targets
- `test_physiological_bounds.py` - Max shift rates, antidromic risk, sleep duration, melatonin timing
- `test_prc_consistency.py` - Light/melatonin PRC alignment, avoidance zones
- `test_scenario_regression.py` - Canonical routes (Eastman/Burgess, Dean), adaptation timelines
- `test_edge_cases.py` - 12h shifts, extreme chronotypes, multi-leg trips, zero timezone change
- `test_realistic_flights.py` - Real airline routes (VS, BA, AF, SQ, CX) with actual departure/arrival times
- `test_sorting.py` - Intervention sorting, late-night handling, sleep_target near departure filtering
- `test_timezone_handling.py` - Phase timezone handling, is_in_transit flag
- `test_dst_transitions.py` - DST edge cases (spring forward, fall back, ambiguous hours)
- `test_mcp_tools.py` - MCP tool implementations (phase shift, adaptation plan)
- `test_summary_field.py` - Summary field generation for all intervention types, variants, and pipeline preservation
- `conftest.py` - Shared fixtures including `frozen_time` for deterministic date testing

**Time Mocking (Python)**: Uses `time-machine` for C-level time mocking that catches all `datetime.now()` calls including in dependencies like Arcascope. Tests with hardcoded dates use the `frozen_time` fixture (freezes to Jan 1, 2026). Tests needing flexibility use relative dates (`datetime.now() + timedelta(days=N)`).

**Test Helper Pattern**: Mock intervention factories should include all required timezone fields:

```typescript
function createMockIntervention(overrides = {}): Intervention {
  return {
    type: "wake_target",
    title: "Wake Target",
    description: "Time to wake up",
    origin_time: "07:00", // Required
    dest_time: "15:00", // Required
    origin_date: "2026-01-20",
    dest_date: "2026-01-20",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "preparation",
    show_dual_timezone: false,
    ...overrides,
  };
}
```

**Timezone Abbreviation Testing**: When testing timezone abbreviations (PST/PDT, GMT/BST), be aware that Node.js V8 may return offset format instead of abbreviation (e.g., "GMT+1" instead of "BST"). Use regex matching: `expect(result).toMatch(/BST|GMT\+1/)`.

## Design Documents

See `design_docs/` for detailed specifications:

```
design_docs/
├── completed/           # Implemented features (archived)
├── exploration/         # Future ideas, rough scopes, cleanup notes
├── shovel_ready/        # Scoped and ready to implement
│
├── auth-design.md           # NextAuth.js setup, progressive signup flow
├── backend-design.md        # API routes, database schema, MCP tools
├── brand.md                 # Color, tone, and style guidelines
├── debugging-tips.md        # Scheduler debugging lessons learned
├── decisions-overview.md    # All key decisions in one place
├── frontend-design.md       # Screen structure, components, user flows
├── science-methodology.md   # Circadian science foundation
├── testing-design.md        # 6-layer validation strategy
└── vercel-design.md         # Vercel deployment: Next.js + Python coexistence
```
