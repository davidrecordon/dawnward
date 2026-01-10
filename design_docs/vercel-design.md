# Vercel Deployment Design

## Overview

Dawnward runs on Vercel with both Next.js (TypeScript) and Python serverless functions. This document explains how they coexist and the configuration required.

---

## Architecture

```
Production (Vercel)
┌─────────────────────────────────────────────────────────────┐
│                         Vercel Edge                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   /api/schedule/generate  ──────►  Python Function           │
│         (via routes)               (api/schedule/generate.py)│
│                                                              │
│   /api/auth/*             ──────►  Next.js                   │
│   /api/trips/*                     (src/app/api/*)           │
│   /api/user/*                                                │
│   /* (all other routes)                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Local Development (bun dev)
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Dev Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   /api/schedule/generate  ──────►  TypeScript Route          │
│                                    (spawns Python subprocess)│
│                                                              │
│   /api/auth/*             ──────►  Next.js                   │
│   /api/trips/*                     (src/app/api/*)           │
│   /api/user/*                                                │
│   /* (all other routes)                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## The Problem

Vercel auto-detects Python serverless functions in the `api/` directory. When this directory exists, Vercel's routing layer intercepts ALL `/api/*` requests and tries to route them to Python functions—even if there's no matching `.py` file.

This caused Next.js API routes (including `/api/auth/*` for authentication) to return 404 errors in production while working locally.

**Why local dev worked**: The Next.js dev server handles all routes directly, without Vercel's routing layer.

---

## The Solution

Use explicit `builds` and `routes` configuration in `vercel.json` to control routing:

```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    },
    {
      "src": "api/schedule/generate.py",
      "use": "@vercel/python@5.0.2",
      "config": {
        "includeFiles": "api/_python/**"
      }
    }
  ],
  "routes": [
    { "src": "/api/schedule/generate", "dest": "api/schedule/generate.py" }
  ]
}
```

### How It Works

1. **`builds` array**: Explicitly tells Vercel what to build
   - `@vercel/next` for the Next.js app (handles all routes by default)
   - `@vercel/python@5.0.2` for the specific Python function

2. **`routes` array**: Explicitly routes `/api/schedule/generate` to the Python function
   - All other `/api/*` routes fall through to Next.js
   - This is the key: without explicit routes, Vercel would route all `/api/*` to the `api/` directory

3. **`includeFiles`**: Bundles the circadian library (`api/_python/**`) with the Python function

---

## Directory Structure

```
dawnward/
├── api/                              # Python serverless functions (Vercel)
│   ├── schedule/
│   │   └── generate.py               # POST /api/schedule/generate
│   └── _python/                      # Shared Python library (bundled)
│       └── circadian/
│
├── src/app/api/                      # Next.js API routes
│   ├── auth/[...nextauth]/route.ts   # GET/POST /api/auth/*
│   ├── trips/route.ts                # GET/POST /api/trips
│   ├── schedule/generate/route.ts    # Local dev wrapper (spawns Python)
│   └── ...
│
└── vercel.json                       # Deployment configuration
```

### Why Two Schedule Routes?

- **`api/schedule/generate.py`**: Python HTTP handler for Vercel production
- **`src/app/api/schedule/generate/route.ts`**: TypeScript wrapper for local dev (spawns Python subprocess)

Both implement the same API contract. The TypeScript version allows `bun dev` to work without Vercel's Python runtime.

---

## Adding New Python Functions

To add another Python endpoint:

1. Create the Python file in `api/`:

   ```
   api/
   └── newfunction/
       └── handler.py
   ```

2. Update `vercel.json`:

   ```json
   {
     "builds": [
       { "src": "package.json", "use": "@vercel/next" },
       {
         "src": "api/schedule/generate.py",
         "use": "@vercel/python@5.0.2",
         "config": { "includeFiles": "api/_python/**" }
       },
       { "src": "api/newfunction/handler.py", "use": "@vercel/python@5.0.2" }
     ],
     "routes": [
       { "src": "/api/schedule/generate", "dest": "api/schedule/generate.py" },
       { "src": "/api/newfunction", "dest": "api/newfunction/handler.py" }
     ]
   }
   ```

3. Optionally create a TypeScript wrapper in `src/app/api/` for local development.

---

## Configuration Constraints

**Cannot use together:**

- `builds` and `functions` (Vercel error: mutually exclusive)

**Python functions must be in `api/`:**

- Vercel only auto-detects Python in the `api/` directory
- Moving Python to other directories requires explicit `builds` config

**Pin Python runtime version:**

- Use `@vercel/python@5.0.2` (or specific version) for reproducibility
- Avoid `@vercel/python` (latest) to prevent surprise breaking changes

---

## Environment Variables

Configure in Vercel dashboard (Settings > Environment Variables):

| Variable               | Purpose                           |
| ---------------------- | --------------------------------- |
| `DATABASE_URL`         | Prisma Postgres connection string |
| `AUTH_SECRET`          | Auth.js session encryption key    |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID            |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret        |

**Note:** `NEXTAUTH_URL` is not needed—Auth.js v5 infers the URL from request headers.

---

## Debugging Tips

### Check which runtime is handling a request

Look at the error message format in Vercel logs:

- **Python**: `127.0.0.1 - - [date] code 501, message Unsupported method`
- **Next.js**: Standard JSON error responses

### Verify routes are correct

Deploy and check Vercel Functions tab to see which functions were built.

### Test individual endpoints

```bash
# Auth (should be Next.js)
curl -I https://your-deployment.vercel.app/api/auth/session

# Schedule (should be Python)
curl -X POST https://your-deployment.vercel.app/api/schedule/generate \
  -H "Content-Type: application/json" \
  -d '{"origin_tz":"America/Los_Angeles",...}'
```

---

## Related Documentation

- `auth-design.md` - Authentication setup, Prisma 7.x workaround
- `backend-design.md` - API routes, database schema
- `design_docs/completed/vercel_auth_debugging/` - Detailed debugging history
