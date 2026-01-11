# Vercel Stack Best Practices

A reference guide for deploying a Next.js application on Vercel with Bun runtime, NextAuth v5, Prisma ORM, Vercel Postgres, and Python serverless functions.

This should serve as a solid reference for Dawnward's stack. The main architectural decision you'll want to make early is whether your Python circadian endpoints live at /api/circadian/_ (sharing the /api/ namespace) or at a separate prefix like /api/python/_ to keep them clearly separated from any Node.js API routes you might add later.

**Last updated:** January 2025

---

## Table of Contents

1. [Bun Runtime on Vercel](#bun-runtime-on-vercel)
2. [NextAuth v5 (Auth.js)](#nextauth-v5-authjs)
3. [Prisma + Vercel Postgres](#prisma--vercel-postgres)
4. [Python Serverless Functions](#python-serverless-functions)
5. [Project Structure](#project-structure)
6. [Environment Variables](#environment-variables)
7. [Common Gotchas](#common-gotchas)

---

## Bun Runtime on Vercel

Bun is available as a runtime option for Vercel Functions (Public Beta). It provides ~28% lower latency for CPU-bound tasks compared to Node.js.

### Configuration

**vercel.json:**

```json
{
  "bunVersion": "1.x"
}
```

Vercel manages the minor version automatically. `"1.x"` is the only valid value.

### Next.js Scripts

Update `package.json` to use Bun for Next.js commands:

```json
{
  "scripts": {
    "dev": "bun --bun next dev",
    "build": "bun --bun next build",
    "start": "bun --bun next start"
  }
}
```

The `--bun` flag ensures the Next.js CLI runs under Bun runtime while bundling (Turbopack/Webpack) remains unchanged.

### Limitations

| Feature                           | Bun | Node.js |
| --------------------------------- | --- | ------- |
| Automatic source maps             | ❌  | ✅      |
| Bytecode caching                  | ❌  | ✅      |
| Request metrics (node:http/https) | ❌  | ✅      |
| Request metrics (fetch)           | ✅  | ✅      |
| Fluid compute                     | ✅  | ✅      |
| Streaming                         | ✅  | ✅      |

**Note:** `Bun.serve` is not supported on Vercel Functions. Use supported frameworks: Next.js, Express, Hono, or Nitro.

---

## NextAuth v5 (Auth.js)

NextAuth v5 is a major rewrite with significant API changes from v4.

### Installation

```bash
npm install next-auth@beta @auth/prisma-adapter @prisma/client
```

**Important:** Use `@auth/prisma-adapter`, not the legacy `@next-auth/prisma-adapter`.

### Environment Variables

All environment variables should be prefixed with `AUTH_`:

```env
# Required
AUTH_SECRET=your-32-char-random-string

# OAuth providers (auto-detected format)
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

Generate the secret:

```bash
npx auth secret
# or
openssl rand -base64 32
```

`AUTH_SECRET` and `AUTH_URL` are aliased for `NEXTAUTH_SECRET` and `NEXTAUTH_URL` for backward compatibility, but use the new convention.

### Configuration

**auth.config.ts** (edge-compatible, for middleware):

```typescript
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig: NextAuthConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // Add your authorization logic
      return isLoggedIn;
    },
  },
};
```

**auth.ts** (full config with Prisma adapter):

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
});
```

**app/api/auth/[...nextauth]/route.ts:**

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**middleware.ts:**

```typescript
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Key Changes from v4

- `getServerSession()` → `auth()`
- `@next-auth/prisma-adapter` → `@auth/prisma-adapter`
- `NEXTAUTH_SECRET` → `AUTH_SECRET` (preferred)
- Configuration split for edge compatibility

---

## Prisma + Vercel Postgres

Vercel Postgres is Neon under the hood. Use the Neon serverless driver for edge/serverless compatibility.

### Installation

```bash
npm install @prisma/client @prisma/adapter-neon @neondatabase/serverless ws
npm install -D prisma @types/ws
```

### Schema Configuration

**prisma/schema.prisma:**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Auth.js required models
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### Environment Variables

```env
# Pooled connection (used by Prisma Client via adapter)
DATABASE_URL="postgres://user:password@host-pooler.region.postgres.vercel-storage.com:5432/dbname?sslmode=require"

# Direct connection (used by Prisma CLI for migrations)
DIRECT_URL="postgres://user:password@host.region.postgres.vercel-storage.com:5432/dbname?sslmode=require"
```

### Prisma Client Setup

**lib/prisma.ts:**

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Required for Node.js environments
neonConfig.webSocketConstructor = ws;

// For edge environments, enable:
// neonConfig.poolQueryViaFetch = true

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

### Build Configuration

Add to **package.json**:

```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

---

## Python Serverless Functions

Python functions coexist with Next.js but require special handling due to path conflicts.

### How It Works

1. Python files in `/api/` directory become Vercel serverless functions
2. Next.js rewrites proxy requests to Flask during local development
3. In production, Vercel hosts Python functions natively

**Critical:** You cannot use both `/app/api/` (Next.js) and `/api/` (Python) for the same paths. Use distinct prefixes.

### Project Structure

```
├── api/                    # Python serverless functions
│   ├── index.py           # → /api (root endpoint)
│   └── circadian.py       # → /api/circadian
├── app/                    # Next.js App Router
│   ├── api/               # Next.js API routes (Node.js only)
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts
│   └── page.tsx
├── lib/
│   └── prisma.ts
├── next.config.js
├── requirements.txt
└── package.json
```

### Flask Setup

**api/index.py:**

```python
from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/api")
def home():
    return jsonify({"message": "Hello from Flask!"})

@app.route("/api/circadian", methods=["POST"])
def calculate_circadian():
    # Your Python logic here
    return jsonify({"result": "..."})
```

**requirements.txt:**

```
Flask==3.0.3
# Add your Python dependencies
```

### Next.js Configuration

**next.config.js:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/python/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:5328/api/python/:path*"
            : "/api/python/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
```

**Alternative:** If all `/api/*` routes are Python:

```javascript
async rewrites() {
  return [
    {
      source: "/api/:path*",
      destination:
        process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:5328/api/:path*"
          : "/api/:path*",
    },
  ]
}
```

### Development Scripts

**package.json:**

```json
{
  "scripts": {
    "dev": "concurrently \"npm run next-dev\" \"npm run flask-dev\"",
    "next-dev": "next dev",
    "flask-dev": "pip3 install -r requirements.txt && python3 -m flask --app api/index run -p 5328",
    "build": "next build",
    "start": "next start"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

**Note:** On Windows, use `cross-env` for environment variables or adjust the flask-dev script.

---

## Project Structure

Complete recommended structure:

```
├── api/                          # Python serverless functions
│   ├── index.py
│   └── [endpoint].py
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route group for auth pages
│   │   ├── login/
│   │   └── register/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── lib/
│   └── prisma.ts
├── prisma/
│   └── schema.prisma
├── public/
├── auth.config.ts                # Edge-compatible auth config
├── auth.ts                       # Full auth config with adapter
├── middleware.ts
├── next.config.js
├── package.json
├── requirements.txt
├── tsconfig.json
└── vercel.json
```

---

## Environment Variables

### Complete .env.local

```env
# Auth.js
AUTH_SECRET=your-32-character-secret-here

# OAuth Providers
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# Database (Vercel Postgres / Neon)
DATABASE_URL="postgres://user:pass@host-pooler.region.postgres.vercel-storage.com:5432/db?sslmode=require"
DIRECT_URL="postgres://user:pass@host.region.postgres.vercel-storage.com:5432/db?sslmode=require"
```

### Vercel Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

- `AUTH_SECRET` (all environments)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `DATABASE_URL` / `DIRECT_URL` (auto-populated if using Vercel Postgres integration)

---

## Common Gotchas

### 1. Path Conflicts (Python + Next.js)

- `/app/api/` is for Next.js (Node.js only)
- `/api/` is for Python serverless functions
- Use distinct prefixes to avoid conflicts

### 2. Edge Runtime + Prisma

- `node-postgres` (pg) is **not** supported on Vercel Edge Functions
- Use `@prisma/adapter-neon` with the Neon serverless driver
- Split auth config to keep edge-incompatible code out of middleware

### 3. Function Size Limits

- Vercel serverless functions have a 250MB limit
- Heavy Python packages (NumPy, SciPy) can exceed this
- Use `excludeFiles` in vercel.json if needed:
  ```json
  {
    "functions": {
      "api/**/*.py": {
        "excludeFiles": "public/**"
      }
    }
  }
  ```

### 4. Bun Compatibility

- Bun runtime is in Public Beta
- Some Prisma operations may have quirks with Bun
- Test locally with Bun before deploying

### 5. NextAuth v5 Migration

- `next-auth@beta` is still in beta as of Jan 2025
- Schema is compatible with v4 (no database migration needed)
- OAuth 1.0 support is deprecated

### 6. Local Development

- Flask runs on port 5328 by default
- Next.js rewrites proxy to Flask in development
- In production, Vercel handles routing natively

---

## Quick Start Commands

```bash
# Create project from template
npx create-next-app my-app --example "https://github.com/vercel/examples/tree/main/python/nextjs-flask"

# Install dependencies
npm install
pip install -r requirements.txt

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Run development servers
npm run dev

# Deploy
vercel
```

---

## References

- [Vercel Bun Runtime Docs](https://vercel.com/docs/functions/runtimes/bun)
- [Auth.js (NextAuth v5) Docs](https://authjs.dev)
- [Auth.js Prisma Adapter](https://authjs.dev/getting-started/adapters/prisma)
- [Prisma + Neon Guide](https://neon.com/docs/guides/prisma)
- [Next.js Flask Starter Template](https://vercel.com/templates/next.js/nextjs-flask-starter)
- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
