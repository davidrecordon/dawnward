# Dawnward Auth Design Document

## Overview

Dawnward uses a progressive sign-up model: users can generate jet lag plans without an account, then optionally sign in to save their work. This reduces friction for first-time users while providing value to returning users.

## Auth Provider

**Google only** via NextAuth.js v5.

Rationale:
- Target users likely have Google accounts
- Enables Calendar integration with single OAuth flow
- Simplifies implementation (no password management, email verification, etc.)

## OAuth Scopes

```
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

| Scope | Purpose |
|-------|---------|
| `openid` | Required for OIDC |
| `email` | User identification, display |
| `profile` | Display name, avatar |
| `calendar.events` | Create/update/delete events on user's calendar |

**Note:** `calendar.events` is write-only. We push intervention reminders to the calendar but never read calendar data. This is intentional — users don't need to trust us with their schedule; we only add our events.

## User States

```
┌─────────────────────────────────────────────────────────────┐
│                        ANONYMOUS                            │
│  - Can create trips                                         │
│  - Can generate schedules                                   │
│  - Can view/interact with schedule                          │
│  - Data stored in localStorage only                         │
│  - Cannot sync to Calendar                                  │
│  - Cannot access from other devices                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Sign in with Google
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      AUTHENTICATED                          │
│  - All anonymous capabilities, plus:                        │
│  - Trips saved to database                                  │
│  - Can sync schedule to Google Calendar                     │
│  - Can access trips from any device                         │
│  - Can view trip history                                    │
│  - Can set default preferences                              │
└─────────────────────────────────────────────────────────────┘
```

## Progressive Sign-Up Flow

### First-Time User Journey

```
1. User lands on Dawnward
2. User creates a trip (origin → destination, dates)
3. App generates schedule using Forger99 model
4. User views their personalized plan
5. User sees prompt: "Sign in to save this trip and sync to Calendar"
6. User clicks "Sign in with Google"
7. OAuth flow completes
8. localStorage trip is migrated to database
9. User can now sync to Calendar
```

### Anonymous Data Storage

While anonymous, trip data lives in `localStorage`:

```typescript
interface LocalTrip {
  id: string;              // Client-generated UUID
  createdAt: string;       // ISO timestamp
  legs: LocalLeg[];
  prepDays: number;
  schedule?: ScheduleData; // Generated plan
}

interface LocalLeg {
  sequence: number;
  originTz: string;
  destTz: string;
  originAirport?: string;
  destAirport?: string;
  departureDatetime: string;
  arrivalDatetime: string;
}

// localStorage key
const STORAGE_KEY = 'dawnward_trips';
```

### Migration on Sign-In

When a user signs in for the first time:

```typescript
async function migrateLocalTrips(userId: string) {
  const localTrips = getLocalTrips();
  
  for (const localTrip of localTrips) {
    // Create trip in database
    const dbTrip = await db.trips.create({
      data: {
        userId,
        prepDays: localTrip.prepDays,
        status: 'planned',
      }
    });
    
    // Create legs
    for (const leg of localTrip.legs) {
      await db.legs.create({
        data: {
          tripId: dbTrip.id,
          sequence: leg.sequence,
          originTz: leg.originTz,
          destTz: leg.destTz,
          originAirport: leg.originAirport,
          destAirport: leg.destAirport,
          departureDatetime: leg.departureDatetime,
          arrivalDatetime: leg.arrivalDatetime,
        }
      });
    }
    
    // Migrate schedule if exists
    if (localTrip.schedule) {
      await db.schedules.create({
        data: {
          tripId: dbTrip.id,
          modelVersion: localTrip.schedule.modelVersion,
          inputsHash: computeInputsHash(localTrip),
          scheduleData: localTrip.schedule,
        }
      });
    }
  }
  
  // Clear localStorage after successful migration
  clearLocalTrips();
}
```

## NextAuth.js v5 Configuration

### `auth.ts`

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
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.events",
          ].join(" "),
          access_type: "offline",  // Get refresh token
          prompt: "consent",       // Always show consent screen
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist OAuth tokens in JWT
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose access token to client for Calendar API calls
      session.accessToken = token.accessToken;
      return session;
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser) {
        // Migration happens client-side after redirect
        // (client has localStorage, server doesn't)
      }
    },
  },
});
```

### Database Schema Additions

NextAuth requires additional tables. Using Prisma adapter:

```prisma
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

## API Route Protection

### Middleware Pattern

```typescript
// lib/auth.ts
import { auth } from "@/auth";

export async function getRequiredUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

export async function getOptionalUser() {
  const session = await auth();
  return session?.user ?? null;
}
```

### Route Examples

```typescript
// app/api/trips/route.ts
import { getOptionalUser, getRequiredUser } from "@/lib/auth";

// GET /api/trips - list trips (requires auth)
export async function GET() {
  const user = await getRequiredUser();
  const trips = await db.trips.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  return Response.json(trips);
}

// POST /api/trips - create trip (auth optional for now)
export async function POST(req: Request) {
  const user = await getOptionalUser();
  const body = await req.json();
  
  if (user) {
    // Save to database
    const trip = await db.trips.create({ ... });
    return Response.json(trip);
  } else {
    // Return data for client to store in localStorage
    return Response.json({ 
      id: crypto.randomUUID(),
      ...body,
      _storage: 'local' 
    });
  }
}
```

## Token Refresh

Google access tokens expire after 1 hour. For Calendar sync:

```typescript
// lib/google-calendar.ts
import { auth } from "@/auth";
import { google } from "googleapis";

export async function getCalendarClient() {
  const session = await auth();
  if (!session?.accessToken) {
    throw new Error("No access token");
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  
  // googleapis handles refresh automatically
  return google.calendar({ version: "v3", auth: oauth2Client });
}
```

## UI Components

### Sign-In Prompt (Post-Schedule)

```tsx
// components/sign-in-prompt.tsx
export function SignInPrompt() {
  return (
    <div className="rounded-lg bg-gradient-to-r from-sky-50 to-amber-50 p-6">
      <h3 className="font-semibold text-gray-900">
        Save your plan
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Sign in to save this trip, sync to Google Calendar, 
        and access from any device.
      </p>
      <SignInButton className="mt-4" />
    </div>
  );
}
```

### Sign-In Button

```tsx
// components/sign-in-button.tsx
"use client";
import { signIn } from "next-auth/react";

export function SignInButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signIn("google")}
      className={cn(
        "inline-flex items-center gap-2 rounded-md bg-white px-4 py-2",
        "border border-gray-200 shadow-sm",
        "hover:bg-gray-50 transition-colors",
        className
      )}
    >
      <GoogleIcon className="h-5 w-5" />
      <span>Sign in with Google</span>
    </button>
  );
}
```

### Auth-Aware Navigation

```tsx
// components/nav.tsx
import { auth } from "@/auth";

export async function Nav() {
  const session = await auth();
  
  return (
    <nav>
      <Link href="/">New Trip</Link>
      
      {session ? (
        <>
          <Link href="/trips">My Trips</Link>
          <Link href="/settings">Settings</Link>
          <UserMenu user={session.user} />
        </>
      ) : (
        <SignInButton />
      )}
    </nav>
  );
}
```

## Protected Routes

| Route | Auth Required | Notes |
|-------|---------------|-------|
| `/` | No | Landing / new trip form |
| `/plan` | No | Schedule view (works with localStorage) |
| `/trips` | Yes | Trip history |
| `/trips/[id]` | Yes | Specific trip (must own) |
| `/settings` | Yes | User preferences |
| `/api/trips` GET | Yes | List user's trips |
| `/api/trips` POST | No | Create trip (saves to DB if auth'd) |
| `/api/trips/[id]/schedule` | No | Generate schedule (stateless) |
| `/api/trips/[id]/calendar` | Yes | Push to Google Calendar |
| `/api/mcp/*` | No | Public MCP interface |

## Error Handling

### OAuth Errors

```typescript
// app/auth/error/page.tsx
export default function AuthError({ 
  searchParams 
}: { 
  searchParams: { error?: string } 
}) {
  const messages: Record<string, string> = {
    OAuthSignin: "Error starting sign-in. Please try again.",
    OAuthCallback: "Error completing sign-in. Please try again.",
    OAuthAccountNotLinked: "This email is already linked to another account.",
    default: "An error occurred. Please try again.",
  };
  
  return (
    <div className="text-center">
      <h1>Sign-in Error</h1>
      <p>{messages[searchParams.error ?? 'default']}</p>
      <SignInButton />
    </div>
  );
}
```

### Calendar Scope Denied

If user denies calendar scope during OAuth:

```typescript
// Check in session callback
async session({ session, token }) {
  const scopes = token.scope?.split(' ') ?? [];
  session.hasCalendarScope = scopes.includes(
    'https://www.googleapis.com/auth/calendar.events'
  );
  return session;
}

// In UI
{!session.hasCalendarScope && (
  <button onClick={() => signIn("google")}>
    Grant Calendar access
  </button>
)}
```

## Security Considerations

1. **CSRF Protection**: NextAuth handles this automatically with `csrfToken`.

2. **Session Storage**: Using JWT strategy (stateless) for simplicity. Sessions stored in signed, encrypted cookies.

3. **Token Storage**: Refresh tokens stored in database via Prisma adapter. Access tokens in JWT.

4. **Scope Minimization**: Only requesting `calendar.events` (not full `calendar` scope). This limits access to event CRUD, not reading existing events.

5. **Trip Ownership**: All trip queries filter by `userId` to prevent accessing others' data.

## Environment Variables

```bash
# NextAuth
NEXTAUTH_URL=https://dawnward.app
NEXTAUTH_SECRET=           # Generate with: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID=          # From Google Cloud Console
GOOGLE_CLIENT_SECRET=      # From Google Cloud Console
```

## Google Cloud Console Setup

1. Create project in Google Cloud Console
2. Enable Google Calendar API
3. Configure OAuth consent screen:
   - App name: Dawnward
   - User support email: your email
   - Scopes: `email`, `profile`, `calendar.events`
   - Authorized domains: `dawnward.app`
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `https://dawnward.app/api/auth/callback/google`
5. Copy Client ID and Client Secret to environment variables

## Future Considerations

Not in v1, but the design accommodates:

1. **Additional Providers**: NextAuth makes adding Apple, GitHub, etc. straightforward if needed.

2. **Account Linking**: Users could link multiple OAuth providers to one account.

3. **Team/Family Sharing**: Could add `trip_shares` table for sharing trips with other users.

4. **API Keys**: For power users who want to integrate with other tools, could add personal API keys.
