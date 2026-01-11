# Minimal Test: Python + Next.js API Route Coexistence

## Hypothesis

Vercel routes requests based on path matching:

- `/api/schedule/*` → matches `api/schedule/generate.py` → Python runtime
- `/api/auth/*` → no match in `api/` dir → falls through to Next.js `src/app/api/auth/`

The POC evidence suggests this should work. Your 404s may have been caused by `vercel.json` configuration, not fundamental routing conflicts.

---

## Test Plan

### Step 1: Create a minimal vercel.json

Replace your current `vercel.json` with the absolute minimum:

```json
{
  "functions": {
    "api/schedule/generate.py": {
      "includeFiles": "api/_python/**"
    }
  }
}
```

**What we removed:**

- Any `rewrites`
- Any `routes` (legacy)
- Any `builds` (legacy - this was breaking things in your Fix Attempt B)

**What we kept:**

- Just the `functions` config to bundle your Python library files

---

### Step 2: Verify directory structure

Your structure should be:

```
dawnward/
├── api/                              # Vercel serverless functions
│   ├── schedule/
│   │   └── generate.py               # → /api/schedule/generate
│   └── _python/                      # Library code (bundled via includeFiles)
│       └── circadian/
│           └── ...
│
├── src/
│   └── app/
│       └── api/                      # Next.js App Router API routes
│           └── auth/
│               └── [...nextauth]/
│                   └── route.ts      # → /api/auth/*
│
├── vercel.json
└── ...
```

**Critical:** The paths must NOT overlap:

- `api/schedule/` handles `/api/schedule/*`
- `src/app/api/auth/` handles `/api/auth/*`
- No file at `api/auth/` (this would shadow Next.js)

---

### Step 3: Add a diagnostic endpoint

Create a simple test endpoint in Next.js to verify routing:

**File: `src/app/api/health/route.ts`**

```typescript
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    runtime: "nodejs",
    timestamp: new Date().toISOString(),
    message: "Next.js API route is working",
  });
}
```

This gives us a non-auth endpoint to test if Next.js routes are reachable at all.

---

### Step 4: Deploy and test

```bash
# Deploy to Vercel
vercel --prod

# Or push to trigger automatic deployment
git add -A
git commit -m "test: minimal vercel.json for route coexistence"
git push
```

---

### Step 5: Test all endpoints

After deployment, test these URLs:

```bash
# 1. Python endpoint (should work - returns schedule)
curl -X POST https://dawnward.app/api/schedule/generate \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 2. Next.js health endpoint (should return JSON)
curl https://dawnward.app/api/health

# 3. NextAuth session endpoint (should return session or null)
curl https://dawnward.app/api/auth/session

# 4. NextAuth providers endpoint (should return providers list)
curl https://dawnward.app/api/auth/providers

# 5. NextAuth signin page (should return HTML or redirect)
curl -I https://dawnward.app/api/auth/signin
```

---

## Expected Results

| Endpoint                 | Expected Status | Expected Response                              |
| ------------------------ | --------------- | ---------------------------------------------- |
| `/api/schedule/generate` | 200 or 400      | Python response (schedule or validation error) |
| `/api/health`            | 200             | `{"ok": true, "runtime": "nodejs", ...}`       |
| `/api/auth/session`      | 200             | `{}` or `{"user": ...}`                        |
| `/api/auth/providers`    | 200             | `{"google": {...}}`                            |
| `/api/auth/signin`       | 200 or 302      | HTML page or redirect                          |

---

## If It Fails

### Failure Mode A: Python works, Next.js 404s

This confirms the shadowing issue. The root `api/` directory is still capturing all `/api/*` requests.

**Next step:** Try the external Python service approach (Modal.com or separate Vercel project).

### Failure Mode B: Python 404s, Next.js works

The `functions` config might not be working correctly.

**Next step:** Check Vercel build logs for Python function detection.

### Failure Mode C: Both 404

Something else is wrong with the deployment.

**Next step:** Check Vercel deployment logs, verify the build completed successfully.

---

## Rollback Plan

If the test breaks production:

```bash
# Revert to previous commit
git revert HEAD
git push

# Or reset to known good state
git reset --hard 471ffb8
git push --force
```

---

## Notes

- The `_python` directory prefix with underscore is important - Vercel ignores directories starting with `_` for routing purposes, so `api/_python/` won't create routes
- The `includeFiles` glob `api/_python/**` bundles all library code with the Python function
- No `runtime` directive needed in vercel.json - Vercel auto-detects Python from `.py` extension
