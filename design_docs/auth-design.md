# Dawnward Auth Design Document

## Overview

Dawnward uses a progressive sign-up model: users can generate jet lag plans without an account, then optionally sign in to save their work. This reduces friction for first-time users while providing value to returning users.

**Implementation is split into two phases:**

- **Phase 1**: Google sign-in (no Calendar access) - save trips, sync preferences
- **Phase 2**: Google Calendar integration - push interventions to calendar

---

## Current State

### What Exists

- `next-auth@5.0.0-beta.30` and `@auth/prisma-adapter` installed
- Placeholder UI elements:
  - `src/components/header.tsx` (line 15-17): Static "Sign in" button
  - `src/app/settings/page.tsx` (lines 83, 104): "Sign in with Google" stub
  - `src/app/trip/page.tsx` (lines 191, 199, 279): Sign-in prompt banners
- Prisma schema is empty (only generator/datasource configured)
- localStorage key: `dawnward_form_state` (form inputs only)

### What Needs Building

**Phase 1 (This Spec):**

- Prisma schema with NextAuth models
- NextAuth configuration (database sessions)
- Auth route handlers
- Auth helper functions
- Middleware for protected routes
- UI components for sign-in flow
- Update existing placeholder elements

**Phase 2 (Calendar - Later):**

- Add `calendar.events` scope
- Google Calendar API client
- Calendar sync functionality
- Re-auth flow for missing calendar scope

---

## Auth Provider

**Google only** via NextAuth.js v5.

Rationale:

- Target users likely have Google accounts
- Enables Calendar integration with single OAuth flow (Phase 2)
- Simplifies implementation (no password management, email verification, etc.)

---

## Phase 1: Google Sign-In

### OAuth Scopes (Phase 1)

```
openid
email
profile
```

| Scope     | Purpose                      |
| --------- | ---------------------------- |
| `openid`  | Required for OIDC            |
| `email`   | User identification, display |
| `profile` | Display name, avatar         |

**Note:** No `calendar.events` scope in Phase 1. Calendar integration comes in Phase 2.

---

### User States

```
┌─────────────────────────────────────────────────────────────┐
│                        ANONYMOUS                            │
│  - Can create trips                                         │
│  - Can generate schedules                                   │
│  - Can view/interact with schedule                          │
│  - Data stored in localStorage only                         │
│  - Cannot access from other devices                         │
│  - Cannot sync to Calendar (Phase 2)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Sign in with Google
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      AUTHENTICATED                          │
│  - All anonymous capabilities, plus:                        │
│  - Trips saved to database                                  │
│  - Can access trips from any device                         │
│  - Can view trip history                                    │
│  - Can set default preferences                              │
│  - Can sync to Google Calendar (Phase 2)                    │
└─────────────────────────────────────────────────────────────┘
```

---

### Database Schema

Add to `prisma/schema.prisma`:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relationships
  accounts Account[]
  sessions Session[]

  // User preferences
  defaultPrepDays       Int     @default(3)
  defaultWakeTime       String  @default("07:00")
  defaultSleepTime      String  @default("23:00")
  usesMelatonin         Boolean @default(true)
  usesCaffeine          Boolean @default(true)
  caffeineCutoffHours   Int     @default(6)
  scheduleIntensity     String  @default("balanced") // gentle, balanced, aggressive
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

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Run after schema update:

```bash
bun prisma migrate dev --name add-auth-tables
bun prisma generate
```

---

### Files to Create

#### 1. `src/auth.ts` - NextAuth Configuration

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Phase 1: Basic scopes only (no calendar)
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  session: {
    strategy: "database", // Use database sessions, not JWT
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async session({ session, user }) {
      // Add user ID to session
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
```

#### 2. `src/lib/prisma.ts` - Prisma Client

```typescript
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

#### 3. `src/app/api/auth/[...nextauth]/route.ts` - Auth Route Handler

```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

#### 4. `src/lib/auth.ts` - Auth Helpers

```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Get the current user or redirect to sign-in (for protected routes)
 */
export async function getRequiredUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  return session.user;
}

/**
 * Get the current user or null (for optional auth)
 */
export async function getOptionalUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const session = await auth();
  return !!session?.user;
}
```

#### 5. `src/middleware.ts` - Route Protection

```typescript
import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Routes that require authentication
const protectedRoutes = ["/history", "/settings"];

export default auth((req) => {
  const isProtected = protectedRoutes.some((route) =>
    req.nextUrl.pathname.startsWith(route)
  );

  if (isProtected && !req.auth) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/history/:path*", "/settings/:path*"],
};
```

#### 6. `src/app/auth/signin/page.tsx` - Sign In Page

```tsx
import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;

  // Already signed in - redirect to callback or home
  if (session) {
    redirect(callbackUrl || "/");
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome to Dawnward
          </h1>
          <p className="mt-2 text-slate-600">
            Sign in to save your trips and access them from any device.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error === "OAuthAccountNotLinked"
              ? "This email is already linked to another account."
              : "An error occurred during sign in. Please try again."}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl || "/" });
          }}
        >
          <SignInButton />
        </form>

        <p className="text-xs text-slate-500">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
```

#### 7. `src/app/auth/error/page.tsx` - Auth Error Page

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  OAuthSignin: "Error starting sign-in. Please try again.",
  OAuthCallback: "Error completing sign-in. Please try again.",
  OAuthAccountNotLinked: "This email is already linked to another account.",
  default: "An unexpected error occurred. Please try again.",
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = errorMessages[error ?? "default"] ?? errorMessages.default;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sign-in Error
          </h1>
          <p className="mt-2 text-slate-600">{message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/auth/signin">Try Again</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

### UI Components to Create

#### 8. `src/components/auth/google-icon.tsx`

```tsx
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
```

#### 9. `src/components/auth/sign-in-button.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";
import { GoogleIcon } from "./google-icon";

interface SignInButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost";
}

export function SignInButton({
  className,
  variant = "default",
}: SignInButtonProps) {
  const baseStyles =
    "inline-flex w-full items-center justify-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2";

  const variantStyles = {
    default:
      "bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  };

  return (
    <button
      type="submit"
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      <GoogleIcon className="h-5 w-5" />
      <span>Sign in with Google</span>
    </button>
  );
}
```

#### 10. `src/components/auth/sign-in-prompt.tsx`

```tsx
import { signIn } from "@/auth";
import { SignInButton } from "./sign-in-button";

interface SignInPromptProps {
  callbackUrl?: string;
}

export function SignInPrompt({ callbackUrl = "/" }: SignInPromptProps) {
  return (
    <div className="rounded-xl border border-sky-200/50 bg-gradient-to-r from-sky-50 to-amber-50 p-6">
      <h3 className="font-semibold text-slate-900">Save your plan</h3>
      <p className="mt-1 text-sm text-slate-600">
        Sign in to save this trip and access it from any device.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
        className="mt-4"
      >
        <SignInButton />
      </form>
    </div>
  );
}
```

#### 11. `src/components/auth/user-menu.tsx`

```tsx
"use client";

import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { LogOut, Settings, History } from "lucide-react";

interface UserMenuProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
          <AvatarFallback className="bg-sky-100 text-xs text-sky-700">
            {initials || "U"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Trip History
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 text-red-600 focus:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### Files to Modify

#### 12. Update `src/components/header.tsx`

```tsx
import Link from "next/link";
import { Plane } from "lucide-react";
import { auth, signIn } from "@/auth";
import { UserMenu } from "./auth/user-menu";

export async function Header() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/20 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500">
            <Plane className="h-4 w-4 -rotate-45 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Dawnward</span>
        </Link>

        {session?.user ? (
          <UserMenu user={session.user} />
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            >
              Sign in
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
```

#### 13. Update `src/app/trip/page.tsx`

Replace the sign-in prompt section (~lines 182-202):

```tsx
// Import at top
import { auth } from "@/auth";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";

// In component, get session
const session = await auth();

// Replace the existing gradient banner with:
{
  !session && <SignInPrompt callbackUrl={`/trip?...`} />;
}
```

#### 14. Update `src/app/settings/page.tsx`

Replace the sign-in stub with actual auth - if not authenticated, show SignInPrompt. If authenticated, show preferences form populated from session.user.

---

### shadcn/ui Components to Add

```bash
bunx shadcn@latest add dropdown-menu avatar
```

---

### Type Extensions

Add to `src/types/next-auth.d.ts`:

```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
```

---

### Environment Variables

Add to `.env.local`:

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000  # https://dawnward.app in production
NEXTAUTH_SECRET=  # Generate with: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID=      # From Google Cloud Console
GOOGLE_CLIENT_SECRET=  # From Google Cloud Console
```

---

### Protected Routes

| Route                      | Auth Required | Notes                                   |
| -------------------------- | ------------- | --------------------------------------- |
| `/`                        | No            | Landing / new trip form                 |
| `/trip`                    | No            | Schedule view (works with localStorage) |
| `/history`                 | Yes           | Trip history                            |
| `/settings`                | Yes           | User preferences                        |
| `/api/auth/*`              | No            | NextAuth handlers                       |
| `/api/schedule/generate`   | No            | Generate schedule (stateless)           |
| `/api/mcp/*`               | No            | Public MCP interface                    |

---

## Phase 2: Google Calendar Integration (Coming Later)

This section scopes the Calendar integration to be implemented after Phase 1 is complete.

### Additional OAuth Scopes

```
https://www.googleapis.com/auth/calendar.events
```

| Scope             | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `calendar.events` | Create/update/delete events on user's calendar |

**Note:** `calendar.events` is write-only. We push intervention reminders to the calendar but never read calendar data. This is intentional — users don't need to trust us with their schedule; we only add our events.

### Auth Config Changes

Update `src/auth.ts`:

```typescript
Google({
  // ... existing config
  authorization: {
    params: {
      scope:
        "openid email profile https://www.googleapis.com/auth/calendar.events",
      access_type: "offline", // Get refresh token
      prompt: "consent", // Always show consent for calendar
    },
  },
});
```

### Session Extensions for Calendar

```typescript
// In auth.ts callbacks
async jwt({ token, account }) {
  if (account) {
    token.accessToken = account.access_token;
    token.refreshToken = account.refresh_token;
    token.expiresAt = account.expires_at;
    token.scope = account.scope;
  }
  return token;
},
async session({ session, token }) {
  session.accessToken = token.accessToken as string | undefined;
  session.hasCalendarScope = token.scope?.includes("calendar.events") ?? false;
  return session;
},
```

### Calendar API Client

Create `src/lib/google-calendar.ts`:

```typescript
import { google } from "googleapis";
import { auth } from "@/auth";

export async function getCalendarClient() {
  const session = await auth();

  if (!session?.accessToken) {
    throw new Error("No access token available");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: session.accessToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}
```

### Calendar Sync API Route

Create `src/app/api/calendar/sync/route.ts`:

```typescript
import { auth } from "@/auth";
import { getCalendarClient } from "@/lib/google-calendar";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.hasCalendarScope) {
    return NextResponse.json(
      { error: "Calendar access not granted" },
      { status: 403 }
    );
  }

  // Implementation: Create calendar events for interventions
  // Delete-and-replace strategy: remove old events, create new ones
  // ...
}
```

### Re-auth Flow for Missing Scope

If user signed in without calendar scope, provide upgrade flow:

```tsx
{
  session && !session.hasCalendarScope && (
    <form
      action={async () => {
        "use server";
        // Re-auth with calendar scope
        await signIn("google", {
          redirectTo: "/trip",
        });
      }}
    >
      <button type="submit">Grant Calendar access</button>
    </form>
  );
}
```

### Database Changes for Calendar

Add to Prisma schema:

```prisma
model CalendarSync {
  id            String   @id @default(cuid())
  tripId        String
  eventIds      String[] // Google Calendar event IDs
  lastSyncedAt  DateTime
  createdAt     DateTime @default(now())

  @@index([tripId])
}
```

---

## Implementation Order

### Phase 1 Sequence

1. **Database Setup**

   - Update `prisma/schema.prisma` with User, Account, Session, VerificationToken
   - Run migration: `bun prisma migrate dev --name add-auth-tables`
   - Create `src/lib/prisma.ts`

2. **NextAuth Core**

   - Create `src/auth.ts`
   - Create `src/app/api/auth/[...nextauth]/route.ts`
   - Create `src/lib/auth.ts` helpers
   - Create `src/types/next-auth.d.ts`

3. **Middleware**

   - Create `src/middleware.ts`

4. **Auth Pages**

   - Create `src/app/auth/signin/page.tsx`
   - Create `src/app/auth/error/page.tsx`

5. **UI Components**

   - Add shadcn: `bunx shadcn@latest add dropdown-menu avatar`
   - Create `src/components/auth/google-icon.tsx`
   - Create `src/components/auth/sign-in-button.tsx`
   - Create `src/components/auth/sign-in-prompt.tsx`
   - Create `src/components/auth/user-menu.tsx`

6. **Update Existing Components**
   - Update `src/components/header.tsx`
   - Update `src/app/trip/page.tsx`
   - Update `src/app/settings/page.tsx`

### Phase 2 Sequence (Later)

1. Add `googleapis` package: `bun add googleapis`
2. Update OAuth scopes in `src/auth.ts`
3. Add session extensions for calendar scope
4. Create `src/lib/google-calendar.ts`
5. Create calendar sync API route
6. Add CalendarSync model to Prisma
7. Update UI with "Add to Calendar" functionality

---

## Verification

### Phase 1 Testing

1. **Sign-in Flow**

   - Visit `/auth/signin` → See sign-in page
   - Click "Sign in with Google" → OAuth redirect
   - Complete OAuth → Redirect back, session created
   - Header shows user avatar menu

2. **Protected Routes**

   - Visit `/history` while logged out → Redirect to sign-in
   - Visit `/history` while logged in → See page

3. **Session Persistence**

   - Sign in, close browser, reopen → Still signed in

4. **Sign-out**

   - Click sign out in user menu → Session cleared, redirect home

5. **Error Handling**
   - Cancel OAuth flow → Redirect to error page with message

### Run Commands

```bash
bun run typecheck      # No TypeScript errors
bun run lint           # No ESLint errors
bun run test:run       # All tests pass
bun run build          # Production build succeeds
```

---

## Files Summary

### Create (12 files)

| File                                     | Purpose                  |
| ---------------------------------------- | ------------------------ |
| `src/auth.ts`                            | NextAuth configuration   |
| `src/lib/prisma.ts`                      | Prisma client singleton  |
| `src/lib/auth.ts`                        | Auth helper functions    |
| `src/app/api/auth/[...nextauth]/route.ts`| Auth API handler         |
| `src/middleware.ts`                      | Route protection         |
| `src/app/auth/signin/page.tsx`           | Sign-in page             |
| `src/app/auth/error/page.tsx`            | Auth error page          |
| `src/components/auth/google-icon.tsx`    | Google logo SVG          |
| `src/components/auth/sign-in-button.tsx` | Sign-in button component |
| `src/components/auth/sign-in-prompt.tsx` | Sign-in prompt card      |
| `src/components/auth/user-menu.tsx`      | User dropdown menu       |
| `src/types/next-auth.d.ts`               | TypeScript declarations  |

### Modify (4 files)

| File                        | Changes                                    |
| --------------------------- | ------------------------------------------ |
| `prisma/schema.prisma`      | Add User, Account, Session, VerificationToken |
| `src/components/header.tsx` | Add session-aware rendering                |
| `src/app/trip/page.tsx`     | Replace sign-in placeholder with SignInPrompt |
| `src/app/settings/page.tsx` | Add auth check, show preferences form      |

### Add Dependencies

```bash
bunx shadcn@latest add dropdown-menu avatar
```

---

## Google Cloud Console Setup

1. Create project in Google Cloud Console
2. Configure OAuth consent screen:
   - App name: Dawnward
   - User support email: your email
   - Scopes: `email`, `profile` (Phase 1) — add `calendar.events` in Phase 2
   - Authorized domains: `dawnward.app`
3. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://dawnward.app/api/auth/callback/google`
4. Copy Client ID and Client Secret to environment variables

---

## Security Considerations

1. **CSRF Protection**: NextAuth handles this automatically with `csrfToken`.

2. **Session Storage**: Using database sessions (not JWT) for better security and revocation capability.

3. **Token Storage**: Access and refresh tokens stored in database via Prisma adapter.

4. **Scope Minimization**: Phase 1 only requests basic profile scopes. Calendar scope added only in Phase 2 when needed.

5. **Trip Ownership**: All trip queries must filter by `userId` to prevent accessing others' data.

---

## Future Considerations

Not in v1, but the design accommodates:

1. **Additional Providers**: NextAuth makes adding Apple, GitHub, etc. straightforward if needed.

2. **Account Linking**: Users could link multiple OAuth providers to one account.

3. **Team/Family Sharing**: Could add `trip_shares` table for sharing trips with other users.

4. **API Keys**: For power users who want to integrate with other tools, could add personal API keys.
