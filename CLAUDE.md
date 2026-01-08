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
bun run lint         # Run ESLint

# Testing
bun test             # Run Vitest in watch mode
bun test:run         # Run all TypeScript tests once
bun test:python      # Run all Python pytest tests

# Database (Prisma)
bun prisma generate     # Generate Prisma client to src/generated/prisma
bun prisma migrate dev  # Run migrations in development
bun prisma studio       # Open Prisma Studio GUI
```

## Tech Stack

- **Framework**: Next.js 16+ (App Router, React 19)
- **Auth**: NextAuth.js v5 with Google provider (includes Calendar scope)
- **Database**: PostgreSQL via Prisma (Vercel Postgres in prod)
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Python Runtime**: Vercel Python Functions for circadian model (Arcascope library)
- **Analytics**: Vercel Analytics (respects GPC and DNT privacy signals)
- **Testing**: Vitest for TypeScript, pytest for Python

## Architecture

### Directory Structure

```
src/
├── app/              # Next.js App Router pages and API routes
├── components/ui/    # shadcn/ui components (Button, Card, Input, etc.)
├── lib/              # Shared utilities (cn() for Tailwind class merging)
│   └── __tests__/    # Vitest unit tests for utilities
├── test/             # Test setup and configuration
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
├── schema.prisma     # Database schema
└── migrations/       # Database migrations

design_docs/          # Product specifications and design decisions
```

### Key Patterns

**Import alias**: Use `@/*` for `src/*` imports (e.g., `@/lib/utils`, `@/components/ui/button`)

**UI Components**: Using shadcn/ui with Radix primitives. Components use `class-variance-authority` for variants and the `cn()` helper for class merging. Add new components with `bunx shadcn@latest add <component>` (use bunx, not npx).

**Auth Flow**: Progressive signup - anonymous users can generate one schedule (stored in localStorage), then sign in with Google to save trips to database and sync to Google Calendar.

### Database Schema (Key Tables)

- `users` - Google ID, email, default preferences (prep_days, wake/sleep times, melatonin/caffeine prefs)
- `trips` - Container for legs with status (planned/active/completed) and prep_days
- `legs` - Individual flight segments with origin/destination timezones and datetimes
- `schedules` - Generated plans with model_version and inputs_hash for cache invalidation
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

Public read-only endpoint at `/api/mcp` for Claude to answer jet lag questions. No auth required, rate limited by IP.

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - App URL (https://dawnward.app)
- `NEXTAUTH_SECRET` - Session encryption key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth credentials

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

This project uses two Claude Code plugins that should be invoked for significant work:

**`/frontend-design`** - Use when building or modifying UI components
- Designs distinctive, production-grade interfaces
- Ensures brand consistency (colors, typography, spacing)
- Avoids generic "AI slop" aesthetics

**`/feature-dev`** - Use when implementing new features
- Guided feature development with codebase understanding
- Explores existing patterns before writing code
- Asks clarifying questions, designs architecture, then implements
- Includes code review phase

**When to use them:**
- Building new components or pages → `/frontend-design`
- Implementing backend features, APIs, or complex logic → `/feature-dev`
- Small fixes, typos, or simple changes → No skill needed

## Testing

**TypeScript (Vitest)**: ~170 tests covering utility functions
- `src/lib/__tests__/time-utils.test.ts` - Date/time formatting, timezone-aware operations
- `src/lib/__tests__/timezone-utils.test.ts` - Flight duration calculation, timezone shifts
- `src/lib/__tests__/airport-search.test.ts` - Search scoring, matching, filtering
- `src/lib/__tests__/intervention-utils.test.ts` - Intervention styling, time formatting
- `src/lib/__tests__/schedule-storage.test.ts` - Form state localStorage persistence
- `src/lib/__tests__/error-utils.test.ts` - Error message extraction
- `src/lib/schedule-utils.test.ts` - Schedule merging and sorting logic
- `src/app/api/schedule/generate/__tests__/route.test.ts` - API route data construction

**Python (pytest)**: ~135 tests covering schedule generation (6-layer validation strategy)
- `test_model_parity.py` - CBTmin trajectory, phase shift magnitude, daily shift targets
- `test_physiological_bounds.py` - Max shift rates, antidromic risk, sleep duration, melatonin timing
- `test_prc_consistency.py` - Light/melatonin PRC alignment, avoidance zones
- `test_scenario_regression.py` - Canonical routes (Eastman/Burgess, Dean), adaptation timelines
- `test_edge_cases.py` - 12h shifts, extreme chronotypes, multi-leg trips, zero timezone change
- `test_realistic_flights.py` - Real airline routes (VS, BA, AF, SQ, CX) with actual departure/arrival times
- `test_sorting.py` - Intervention sorting, late-night handling, sleep_target near departure filtering
- `test_timezone_handling.py` - Phase timezone handling, is_in_transit flag

**Running tests:**
```bash
bun test:run         # Run all TypeScript tests
bun test:python      # Run all Python tests
```

## Design Documents

See `design_docs/` for detailed specifications:
- `decisions-overview.md` - All key decisions in one place
- `backend-design.md` - API routes, database schema, MCP tools
- `auth-design.md` - NextAuth.js setup, progressive signup flow
- `testing-design.md` - 6-layer validation strategy (model parity, physiological bounds, PRC consistency, scenario regression, edge cases, realistic flights)
- `science-methodology.md` - Circadian science foundation (PRCs, melatonin, caffeine, in-flight sleep, multi-leg trips)

## Visual and Branding Design Documents
- `design_docs/brand.md` - All of Dawnward's color, tone and style
- `design_docs/frontend-design.md` - Screen structure, components, user flows, and responsive behavior
- `design_docs/ui-v2-homepage-only.html` - An initial static mockup of the homepage which is small enough to fit into your context window
- `design_docs/ui-v2.html` - An initial static mockup of key screens