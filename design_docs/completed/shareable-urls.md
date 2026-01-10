# Shareable Schedule URLs - Sprint Backlog Item

## Overview

Enable logged-in users to share their jet lag optimization schedules via short URLs. This creates an upsell moment for anonymous users and enables viral growth.

**Key Requirements:**

- Login required to create share links (upsell feature)
- Short, clean URLs (`dawnward.app/s/abc123`)
- Anyone can view shared schedules (no login to view)
- User attribution on shared schedules
- Database-backed for reliability and analytics

**Depends On:** Auth Phase 1 (Google sign-in)

## Design Decision: Database-Backed Short URLs

**Chosen Approach:** Store schedule inputs in database, generate short URL codes.

**Why This Approach:**

- Short, memorable URLs (21 chars total vs ~330 for URL-encoded)
- User attribution ("Schedule by David")
- Analytics: track shares, views, conversions
- Upsell moment: "Sign in to share this schedule"
- Can revoke/edit shares later if needed

**Trade-offs:**

- Requires database (but we have it for auth)
- Requires login to share (intentional - upsell feature)

**URL Format:** `https://dawnward.app/s/abc123` (6-char code, base62)

## Database Schema

**Add to `prisma/schema.prisma`:**

```prisma
model SharedSchedule {
  id        String   @id @default(cuid())
  code      String   @unique @db.VarChar(8)  // Base62 short code
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Schedule inputs (denormalized for fast regeneration)
  originTz          String
  destTz            String
  departureDatetime String
  arrivalDatetime   String
  prepDays          Int
  wakeTime          String
  sleepTime         String
  usesMelatonin     Boolean
  usesCaffeine      Boolean
  usesExercise      Boolean
  napPreference     String   @default("flight_only")
  scheduleIntensity String   @default("balanced")

  // Metadata
  routeLabel   String?  // e.g., "SFO → NRT" for display
  viewCount    Int      @default(0)
  createdAt    DateTime @default(now())
  lastViewedAt DateTime?

  @@index([userId])
  @@index([code])
}
```

**Update User model:**

```prisma
model User {
  // ... existing fields
  sharedSchedules SharedSchedule[]
}
```

## Implementation Plan

### Phase 1: Database & API (~4 hours)

**File:** `prisma/schema.prisma`

- Add `SharedSchedule` model (schema above)
- Run `bun prisma migrate dev`

**File:** `src/app/api/share/route.ts` (Create)

```typescript
// POST /api/share - Create share link (requires auth)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to share" }, { status: 401 });
  }

  const body = await request.json();
  // Validate inputs...

  const code = generateShortCode(); // 6-char base62

  const shared = await prisma.sharedSchedule.create({
    data: {
      code,
      userId: session.user.id,
      originTz: body.origin_tz,
      destTz: body.dest_tz,
      // ... rest of fields
    },
  });

  return NextResponse.json({
    url: `${process.env.NEXTAUTH_URL}/s/${shared.code}`,
    code: shared.code,
  });
}
```

**File:** `src/lib/short-code.ts` (Create)

```typescript
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateShortCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += BASE62[Math.floor(Math.random() * 62)];
  }
  return code;
}
```

### Phase 2: Share Page Route (~6 hours)

**File:** `src/app/s/[code]/page.tsx` (Create)

```typescript
export default async function SharedSchedulePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  // Lookup share in database
  const shared = await prisma.sharedSchedule.findUnique({
    where: { code },
    include: { user: { select: { name: true } } },
  });

  if (!shared) {
    notFound();
  }

  // Increment view count (fire and forget)
  prisma.sharedSchedule
    .update({
      where: { id: shared.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => {});

  // Generate schedule from stored inputs
  const schedule = await generateSchedule({
    origin_tz: shared.originTz,
    dest_tz: shared.destTz,
    // ... rest
  });

  return (
    <div>
      {/* Attribution banner */}
      <div className="bg-sky-50 border-b border-sky-100 px-4 py-2 text-sm text-sky-700">
        Schedule shared by {shared.user.name || "a Dawnward user"}
      </div>

      {/* Existing schedule display components */}
      <ScheduleTimeline schedule={schedule} />

      {/* CTA banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-lg mt-6">
        <p className="font-medium">Planning your own trip?</p>
        <a href="/" className="text-amber-700 underline">
          Create your free jet lag schedule
        </a>
      </div>
    </div>
  );
}
```

**File:** `src/app/s/[code]/not-found.tsx` (Create)

```typescript
export default function SharedNotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="text-2xl font-bold">Schedule not found</h1>
      <p className="text-slate-600 mt-2">
        This share link may have expired or been removed.
      </p>
      <a href="/" className="text-sky-600 underline mt-4 block">
        Create your own schedule
      </a>
    </div>
  );
}
```

### Phase 3: Share Button UI (~4 hours)

**File:** `src/components/share-button.tsx` (Create)

```typescript
interface ShareButtonProps {
  formState: TripFormState;
  disabled?: boolean;
}

export function ShareButton({ formState, disabled }: ShareButtonProps) {
  const { data: session } = useSession();
  const [status, setStatus] = useState<"idle" | "loading" | "copied">("idle");

  async function handleShare() {
    // If not logged in, prompt to sign in
    if (!session) {
      // Could open sign-in modal or redirect
      signIn("google", { callbackUrl: window.location.href });
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        body: JSON.stringify(formStateToApiRequest(formState)),
      });
      const { url } = await res.json();

      // Copy to clipboard or use share sheet
      if (navigator.share) {
        await navigator.share({ url, title: "My Jet Lag Schedule" });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setStatus("idle");
    }
  }

  return (
    <Button onClick={handleShare} disabled={disabled || status === "loading"}>
      {status === "copied" ? (
        <>
          <Check className="w-4 h-4 mr-2" /> Copied!
        </>
      ) : status === "loading" ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sharing...
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4 mr-2" />
          {session ? "Share Schedule" : "Sign in to Share"}
        </>
      )}
    </Button>
  );
}
```

**File:** `src/app/trip/page.tsx` (Modify)

- Add `<ShareButton />` to footer alongside existing actions

### Phase 4: Testing (~4 hours)

**File:** `src/lib/__tests__/short-code.test.ts` (Create)

```typescript
describe("generateShortCode", () => {
  it("generates 6-char code by default", () => {
    expect(generateShortCode()).toHaveLength(6);
  });

  it("uses only base62 characters", () => {
    const code = generateShortCode();
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it("generates unique codes", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateShortCode())
    );
    expect(codes.size).toBe(100);
  });
});
```

**Manual testing:**

1. Anonymous user: Click Share, prompted to sign in
2. Signed-in user: Click Share, URL copied/shared
3. Open shared URL in incognito, verify schedule displays
4. Verify attribution banner shows sharer's name
5. Verify CTA banner links to homepage
6. Verify 404 page for invalid codes

**Total Estimate:** ~18 hours (2-3 days)

## Questions to Answer

1. **Code length:** 6 chars = 56B combinations. Sufficient for years.
   - **Decision:** 6 characters

2. **Expiration:** Should share links expire?
   - **Recommendation:** No expiration for MVP. Can add later if abuse.

3. **Edit/delete:** Can users manage their shares?
   - **Recommendation:** Defer to v2. Low priority.

4. **Rate limit:** Limit shares per user?
   - **Recommendation:** 100 shares/day (generous, prevents abuse)

5. **Analytics events:**
   - `share_created` - User creates share link
   - `share_viewed` - Someone views shared schedule
   - `share_to_signup` - Viewer signs up after viewing share

## Files to Create/Modify

| File                                   | Action | Description                 |
| -------------------------------------- | ------ | --------------------------- |
| `prisma/schema.prisma`                 | Modify | Add SharedSchedule model    |
| `src/lib/short-code.ts`                | Create | Short code generation       |
| `src/lib/__tests__/short-code.test.ts` | Create | Unit tests                  |
| `src/app/api/share/route.ts`           | Create | Create share API (auth req) |
| `src/app/s/[code]/page.tsx`            | Create | Public schedule viewer      |
| `src/app/s/[code]/not-found.tsx`       | Create | 404 for invalid codes       |
| `src/components/share-button.tsx`      | Create | Share button with auth gate |
| `src/app/trip/page.tsx`                | Modify | Add ShareButton             |

## Verification Steps

1. `bun prisma migrate dev` - Migration runs successfully
2. `bun run typecheck` - No type errors
3. `bun run test:run` - All tests pass
4. Manual: Anonymous user clicks Share, redirected to sign in
5. Manual: Signed-in user clicks Share, short URL copied
6. Manual: Open shared URL in incognito, schedule displays
7. Manual: Verify attribution banner shows correct name
8. Manual: Invalid code shows 404 page
9. Manual: Test on mobile (share sheet)

## Success Criteria

- [ ] Login required to create share links
- [ ] Short URLs work (`/s/abc123`)
- [ ] Anyone can view shared schedules
- [ ] Attribution banner shows sharer's name
- [ ] CTA banner links to homepage
- [ ] Share button prompts sign-in for anonymous users
- [ ] Invalid codes show friendly 404
- [ ] All tests pass
