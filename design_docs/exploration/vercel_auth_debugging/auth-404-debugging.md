# Auth 404 Debugging Document

## Problem Statement

Production auth routes at `https://dawnward.app/api/auth/*` return 404 errors. The Google OAuth callback fails, preventing users from signing in.

---

## Environment Summary

### Vercel Production Environment

- **Framework**: Next.js 16.1.1 (auto-detected)
- **Build Command**: `next build` (default)
- **Output Directory**: `.next` (default)
- **Node.js Version**: 20.x (Vercel default)
- **Python Version**: 3.12 (for serverless functions)
- **Region**: Likely `iad1` (US East)

**Environment Variables (configured in Vercel dashboard):**

- `DATABASE_URL` - Prisma Postgres connection string
- ~~`NEXTAUTH_URL`~~ - **REMOVED** (was `https://dawnward.app`, removed during debugging)
- `AUTH_SECRET` - Session encryption key (renamed from `NEXTAUTH_SECRET` during debugging)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

**Vercel Configuration (`vercel.json`):**

```json
{
  "functions": {
    "api/schedule/generate.py": {
      "includeFiles": "api/_python/**"
    }
  }
}
```

### Local Development Environment

- **OS**: macOS Darwin 25.1.0
- **Runtime**: Bun (for package management and scripts)
- **Node.js**: Via Bun runtime
- **Database**: Connects to Vercel-hosted Prisma Postgres (same as production)
- **Working Directory**: `/Users/davidrecordon/Documents/dawnward`

**Local dev works correctly** - auth routes function as expected when running `bun dev`.

---

## Key Dependency Versions

| Package                | Version            | Notes                             |
| ---------------------- | ------------------ | --------------------------------- |
| `next`                 | `16.1.1`           | App Router, React 19              |
| `next-auth`            | `^5.0.0-beta.30`   | v5 beta with Edge Runtime support |
| `react`                | `19.2.3`           | React 19                          |
| `prisma`               | `^7.2.0`           | ORM                               |
| `@prisma/adapter-pg`   | `^7.2.0`           | Native PostgreSQL driver adapter  |
| `@auth/prisma-adapter` | `^2.11.1`          | NextAuth Prisma adapter           |

---

## Current Directory Structure

```
dawnward/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts        # NextAuth catch-all handler
│   │   │   ├── schedule/
│   │   │   │   └── generate/
│   │   │   │       └── route.ts        # TypeScript route (unused - Python shadows)
│   │   │   ├── share/
│   │   │   ├── trips/
│   │   │   └── user/
│   │   ├── auth/
│   │   │   ├── signin/
│   │   │   │   └── page.tsx
│   │   │   └── error/
│   │   │       └── page.tsx
│   │   └── ...
│   ├── components/
│   │   └── auth/                       # Auth UI components
│   ├── lib/
│   │   └── prisma.ts                   # Prisma client singleton
│   ├── generated/
│   │   └── prisma/                     # Generated Prisma client
│   ├── auth.ts                         # Full NextAuth config (server-side)
│   ├── auth.config.ts                  # Edge-compatible auth config
│   └── middleware.ts                   # Route protection middleware
│
├── api/                                # ⚠️ Python serverless functions - SHADOWS src/app/api/
│   ├── schedule/
│   │   └── generate.py                 # Schedule generation endpoint
│   └── _python/
│       ├── circadian/                  # Circadian model library
│       │   ├── scheduler_v2.py
│       │   ├── types.py
│       │   ├── circadian_math.py
│       │   ├── science/
│       │   └── scheduling/
│       └── tests/                      # Python pytest tests
│
├── prisma/
│   ├── schema.prisma                   # Database schema
│   └── migrations/                     # Migration history
│
└── vercel.json                         # Vercel configuration
```

---

## Python Serverless Function Details

**Entry Point**: `api/schedule/generate.py`

**Handler Class**:

```python
from http.server import BaseHTTPRequestHandler

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Handles POST /api/schedule/generate
        # Generates jet lag adaptation schedule

    def do_OPTIONS(self):
        # CORS preflight handling
```

**Import Path Resolution**:

```python
sys.path.insert(0, str(Path(__file__).parent.parent / "_python"))
from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler_v2 import ScheduleGeneratorV2
```

**Bundled Files** (via `includeFiles`):

- All files in `api/_python/**` are bundled with the function
- Includes circadian library, types, science modules, scheduling logic

---

## Prisma Configuration

**Generator** (`prisma/schema.prisma`):

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**Client Initialization** (`src/lib/prisma.ts`):

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter });
}
```

**Build Hook** (`package.json`):

```json
{
  "postinstall": "prisma generate"
}
```

---

## What We Tried (All Failed)

### Attempt 1: Add Node.js Runtime Directive

**File**: `src/app/api/auth/[...nextauth]/route.ts`

```typescript
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = handlers;
```

**Result**: Still 404

### Attempt 2: Output File Tracing

**File**: `next.config.ts`

```typescript
outputFileTracingIncludes: {
  "/api/auth/\\[\\.\\.\\.nextauth\\]": ["./node_modules/@prisma/**/*"],
}
```

**Result**: Still 404

### Attempt 3: Server External Packages

**File**: `next.config.ts`

```typescript
serverExternalPackages: ["@prisma/adapter-pg"],
```

**Result**: Still 404

### Attempt 4: Switch Prisma to Default Output Path

Changed from custom `src/generated/prisma` to default `node_modules/@prisma/client`

- Updated `prisma/schema.prisma` to remove custom output
- Changed provider from `prisma-client` to `prisma-client-js`
- Added `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
- Updated imports in `src/lib/prisma.ts`

**Result**: Still 404

### Attempt 5: Diagnostic Try/Catch Wrapper

Wrapped auth handlers in try/catch to expose actual errors instead of 404

**Result**: Still got 404 (wrapper never executed)

### Attempt 6: Optional Catch-All Route

Changed `[...nextauth]` to `[[...nextauth]]` (optional catch-all)

**Result**: Still 404

### Attempt 7: Rewrites to Bypass Catch-All

**File**: `next.config.ts`

```typescript
async rewrites() {
  return [{
    source: "/api/auth/:path*",
    destination: "/api/auth-handler?__nextauth=:path*",
  }];
}
```

Created `src/app/api/auth-handler/route.ts` as target

**Result**: Got 501 instead of 404 (progress!)

### Attempt 8: Analyze 501 Error

Error message format: `127.0.0.1 - - [date] code 501, message Unsupported method ('GET')`

**Key Discovery**: This is Python HTTP server log format, NOT Node.js!

### Attempt 9: Remove NEXTAUTH_URL

Removed `NEXTAUTH_URL` environment variable from Vercel dashboard.

**Result**: Still 404 (but worth noting for completeness)

---

## Root Cause Identified

**The `api/` directory at the project root was shadowing ALL Next.js API routes.**

Vercel routes `/api/*` requests to the root `api/` directory (for Python/Go serverless functions) BEFORE Next.js can handle them. This means:

- `/api/auth/session` → Routed to Python runtime → 404/501
- `/api/auth/callback/google` → Routed to Python runtime → 404/501
- `/api/health` → Routed to Python runtime → 404/501
- All `src/app/api/*` routes were completely bypassed

**Why local dev worked**: Local Next.js dev server handles all routes directly without Vercel's routing layer.

---

## Attempted Fixes for Root Cause

### Fix Attempt A: Rename `api/` to `python-api/`

- Renamed entire `api/` directory to `python-api/`
- Updated `vercel.json` with rewrite:

```json
{
  "functions": {
    "python-api/_python/schedule/generate.py": {
      "includeFiles": "python-api/_python/**"
    }
  },
  "rewrites": [
    {
      "source": "/api/schedule/generate",
      "destination": "/python-api/_python/schedule/generate.py"
    }
  ]
}
```

**Result**: Vercel error - "pattern doesn't match any Serverless Functions"
Vercel only recognizes Python functions in `api/` directory.

### Fix Attempt B: Use `builds` Configuration

```json
{
  "builds": [
    {
      "src": "python-api/_python/schedule/generate.py",
      "use": "@vercel/python",
      "config": { "includeFiles": ["python-api/_python/**"] }
    }
  ],
  "rewrites": [...]
}
```

**Result**: Homepage returned 404! The `builds` config overrides Next.js auto-detection.

### Fix Attempt C: Single Endpoint in `api/` + Library Elsewhere

- Put only `api/schedule/generate.py` in `api/`
- Keep library in `python-api/_python/`
- Update import paths in generate.py

**Result**: Untested - reset before verification

---

## Current State (After Reset)

Reset to commit `471ffb8` (Add postinstall script to generate Prisma client on Vercel)

**What's preserved**:

- Original `api/` directory structure with Python functions
- Original `vercel.json` configuration
- No experimental changes

**What's NOT in the codebase**:

- No `runtime = "nodejs"` directive on auth route
- No custom Prisma output path changes
- No workaround rewrites

**Environment variable changes**:

- `NEXTAUTH_URL` was removed from Vercel (still removed)
- `NEXTAUTH_SECRET` was renamed to `AUTH_SECRET` (NextAuth v5 convention)

---

## Theories to Investigate

1. **Selective Shadowing**: Does having `api/schedule/generate.py` shadow ALL `/api/*` routes, or just `/api/schedule/*`?

2. **Vercel Routing Priority**: Is there a way to configure Vercel to check Next.js routes before Python functions?

3. **Functions Config Scope**: Does the `functions` key in `vercel.json` affect routing behavior beyond just configuring the function?

4. **Hybrid Approach**: Can we use Vercel's API route config to explicitly define which paths go to Python vs Next.js?

5. **Path-Based Routing**: Could using `rewrites` at the Vercel level (not Next.js) help direct traffic correctly?

---

## Next Steps

1. **Test Minimal Case**: Create a fresh Vercel project with ONLY Next.js auth routes (no Python) to confirm auth works in isolation

2. **Test Shadowing Hypothesis**: Deploy with `api/` containing only a README (no Python files) to see if directory presence alone causes shadowing

3. **Research Vercel Routing**: Deep dive into Vercel's routing priority documentation

4. **Consider Alternatives**:
   - Move Python to a separate Vercel project
   - Use Vercel's monorepo feature with separate apps
   - Convert Python function to Node.js (call Python via subprocess or WASM)
   - Use a different hosting approach for Python (e.g., AWS Lambda, Google Cloud Functions)
   - Use Vercel Edge Functions with a Python runtime shim

---

## References

- [Vercel Python Functions](https://vercel.com/docs/functions/runtimes/python)
- [Vercel Routing](https://vercel.com/docs/projects/project-configuration#routes)
- [NextAuth.js v5 Documentation](https://authjs.dev/)
- [Prisma Vercel Deployment](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)

---

_Last updated: January 11, 2025_
