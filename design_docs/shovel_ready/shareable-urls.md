# Shareable Schedule URLs - Sprint Backlog Item

## Overview

Enable users to share their jet lag optimization schedules via URL without requiring authentication. This supports viral growth and allows sharing with travel companions.

**Key Requirements:**
- Works for anonymous users (no sign-in required)
- URLs are copyable/pasteable across all platforms
- Shared schedules viewable by anyone with the link
- No database dependency for core functionality

## Design Decision: URL-Encoded Parameters

**Chosen Approach:** Encode form inputs in URL query parameter, regenerate schedule on load.

**Why This Approach:**
- ✅ No database required - works immediately for anonymous users
- ✅ Stateless - no need to persist shared schedules
- ✅ Deterministic - same inputs always produce same schedule
- ✅ Privacy-friendly - no tracking of who shares what
- ✅ Simple implementation - reuse existing schedule generation API

**Trade-offs:**
- URLs are ~330 chars (well under 2000 char browser limit)
- 2s latency on load (schedule regeneration) - acceptable

**URL Format:** `https://dawnward.app/share?d=v1:eyJvcmlnaW4iOnsiY29kZSI6IlNGTyI...`

**Future Path:** Can layer database caching on top later if needed for shorter URLs.

## Implementation Plan

### Phase 1: URL Encoding Utilities (~4 hours)

**Files to create:**
- `src/lib/share-utils.ts`
- `src/lib/__tests__/share-utils.test.ts`

```typescript
// Encode TripFormState to URL-safe base64 with version prefix
export function encodeScheduleParams(formState: TripFormState): string;

// Decode URL parameter back to TripFormState, with validation
export function decodeScheduleParams(encoded: string): TripFormState | null;

// Generate full shareable URL
export function generateShareUrl(formState: TripFormState): string;
```

**Encoding format:**
- Version prefix: `v1:` (for future format changes)
- Abbreviated keys to reduce URL length
- URL-safe base64 (replace +/= with -_)
- Validation on decode (timezones, datetime formats, enums)

### Phase 2: Share Page Route (~6 hours)

**Files to create:**
- `src/app/share/page.tsx` - Public schedule viewer
- `src/app/share/layout.tsx` - Minimal layout without auth navigation
- `src/app/share/loading.tsx` - Loading state during generation

**Page behavior:**
1. Extract `?d=` parameter from URL
2. Decode and validate parameters
3. Call existing `/api/schedule/generate` endpoint
4. Display schedule using existing components
5. Show CTA banner: "Like this schedule? Create your own on Dawnward"

**Error states:**
- No `?d=` parameter → "Share link not found"
- Invalid base64 → "Corrupted or malformed share link"
- Invalid timezone/datetime → "Invalid schedule parameters"
- API failure → "Unable to generate schedule. Please try again."

### Phase 3: Share Button UI (~4 hours)

**Files to create:**
- `src/components/share-button.tsx`

**Behavior:**
- On mobile: Use `navigator.share()` (opens native share sheet)
- On desktop: Copy URL to clipboard
- Visual feedback: Checkmark + toast notification

**Integration:** Add to `/trip/page.tsx` footer alongside "Add to Calendar"

### Phase 4: Testing & Polish (~4 hours)

**Unit tests:**
- Round-trip encoding preserves all fields
- URL length stays under 500 chars
- Malformed input returns null
- Invalid timezones/datetimes rejected
- Version mismatch returns null

**Manual testing:**
- Generate schedule, click Share, verify URL copied
- Open URL in incognito, verify schedule displays
- Test with all preferences enabled
- Test with edge cases (same-day arrival, max-length names)
- Test on mobile (share sheet)

**Total Estimate:** ~18 hours (2-3 days)

## Questions to Answer

1. **Attribution banner:** Should shared schedules show a "Create your own" CTA banner?
   - **Recommendation:** Yes - helpful for recipients, drives growth

2. **Algorithm updates:** If we update the scheduler, should old share URLs show new or original schedule?
   - **Current behavior:** New schedule (URL encodes inputs, not outputs)
   - **Recommendation:** Keep this - users get best advice

3. **Analytics:** Track share usage?
   - **Recommendation:** Yes, use Vercel Analytics custom events:
     - `share_schedule_clicked` with route
     - `share_schedule_viewed`

4. **Shorter URLs:** Add database caching for shorter URLs?
   - **Recommendation:** Defer to v2 - URL encoding works fine for MVP

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/share-utils.ts` | Create | Encoding/decoding logic |
| `src/lib/__tests__/share-utils.test.ts` | Create | Unit tests |
| `src/components/share-button.tsx` | Create | Copy link button |
| `src/app/share/page.tsx` | Create | Public schedule viewer |
| `src/app/share/layout.tsx` | Create | Minimal layout |
| `src/app/share/loading.tsx` | Create | Loading state |
| `src/app/trip/page.tsx` | Modify | Add ShareButton |

## Verification Steps

1. `bun run typecheck` - No type errors
2. `bun run test:run` - All tests pass
3. Manual: Generate schedule for SFO → NRT
4. Manual: Click "Share Schedule", verify URL copied
5. Manual: Open URL in incognito window
6. Manual: Verify schedule matches original
7. Manual: Test error states (invalid URL, missing parameter)
8. Manual: Test on mobile (share sheet)

## Success Criteria

- [ ] Share URL copies to clipboard on desktop
- [ ] Share sheet opens on mobile
- [ ] Share page displays schedule correctly
- [ ] Invalid URLs show user-friendly errors
- [ ] Works for anonymous users (no auth)
- [ ] URL length < 500 chars
- [ ] Share page load < 2.5s
- [ ] All tests pass
