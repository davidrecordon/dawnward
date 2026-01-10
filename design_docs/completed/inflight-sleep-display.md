# In-Flight Sleep Window Display - Sprint Backlog Item

## Overview

Enhance the display of in-flight sleep windows for ultra-long-haul flights (12+ hours). The backend already generates optimally-timed sleep windows; this feature improves UI prominence to make the flight context clear.

**Key Insight:** The feature is 90% complete - backend generates sleep windows, frontend displays them. The enhancement needed is **visual distinction** to convey "this is different because you're on a plane."

## Current State

### Backend (Complete ✅)

**Location:** `api/_python/circadian/scheduling/phase_generator.py`

For flights ≥12 hours, generates two sleep windows:

- **Window 1:** ~2 hours after departure, up to 4h duration
- **Window 2:** Ends ~2 hours before arrival, up to 4h duration

Each sleep window includes:

- `start`: UTC timestamp
- `duration_hours`: Sleep duration
- `flight_offset_hours`: Hours into flight (e.g., 4.5)
- Converted to `nap_window` intervention type

### Frontend (Partial ✅❌)

**Current display:** Standard intervention card with:

- Purple moon icon (same as regular naps)
- Small sky-blue text: "~4.5 hours into flight"
- Time badge shows destination timezone

**What's missing:**

- No visual distinction from ground-based naps
- Flight offset text is easy to miss (small, bottom of card)
- No flight timeline context
- No "stay awake" guidance between windows

## Design Recommendation

### Enhanced In-Flight Card

**Visual concept:**

```
┌──────────────────────────────────────────────────────┐
│ ✈️ In-Flight Sleep Window          [~4.5h into ✈️]  │
│                                                       │
│ Sleep opportunity                                     │
│ Your body clock makes sleep easier during this       │
│ window. Aim for ~4 hours if possible.                │
│                                                       │
│ ╔═══════════════════════════════════════════════╗   │
│ ║  ~4.5 hours into flight                       ║   │
│ ║  11:40 PM SIN (destination time)              ║   │
│ ╚═══════════════════════════════════════════════╝   │
│                                                       │
│ Progress:  ├────■■■■──────────────────┤             │
│           Depart    Sleep         Arrive             │
└──────────────────────────────────────────────────────┘
```

**Key design elements:**

1. **Sky-blue gradient background** - Distinguishes from purple ground-based naps
2. **Plane icon** in title - Immediate "this is in-flight" recognition
3. **Prominent time display box** - Both flight offset AND destination time equally visible
4. **Mini progress bar** - Visual indicator of when in flight this occurs
5. **Flight offset badge** - Top-right corner for quick scanning

**Brand alignment:**

- Sky blue (`#3B9CC9`) = travel/flights
- Purple (`#6B5BA3`) = sleep
- Gradient blends both concepts

## Implementation Plan

### Phase 1: Enhanced Card Component (~4 hours)

**File to create:** `src/components/schedule/inflight-sleep-card.tsx`

```typescript
interface InFlightSleepCardProps {
  intervention: Intervention;
  timezone?: string;
  totalFlightHours?: number; // For progress bar
}

export function InFlightSleepCard({
  intervention,
  timezone,
  totalFlightHours,
}: InFlightSleepCardProps) {
  // Sky-blue gradient background
  // Plane icon in header
  // Prominent time display box
  // Optional mini progress bar
}
```

**File to modify:** `src/components/schedule/day-section.tsx`

Add conditional rendering:

```typescript
{item.data.type === "nap_window" && item.data.flight_offset_hours !== undefined ? (
  <InFlightSleepCard intervention={item.data} timezone={item.timezone} />
) : (
  <InterventionCard intervention={item.data} timezone={item.timezone} />
)}
```

### Phase 2: Utility Functions (~1 hour)

**File to modify:** `src/lib/intervention-utils.ts`

```typescript
export function getInFlightSleepStyle() {
  return {
    icon: Plane,
    bgGradient: "from-sky-50 via-purple-50 to-sky-50",
    borderColor: "border-sky-200/50",
    accentColor: "sky-500",
    label: "In-Flight Sleep",
  };
}

export function formatFlightPhase(
  offsetHours: number,
  totalHours: number
): string {
  const progress = offsetHours / totalHours;
  if (progress < 0.33) return "Early in flight";
  if (progress < 0.66) return "Mid-flight";
  return "Later in flight";
}
```

### Phase 3: Unit Tests (~1 hour)

**File to create:** `src/lib/__tests__/inflight-utils.test.ts`

```typescript
describe("formatFlightOffset", () => {
  it("formats whole hours", () => {
    expect(formatFlightOffset(4)).toBe("~4 hours into flight");
  });

  it("formats fractional hours", () => {
    expect(formatFlightOffset(4.5)).toBe("~4.5 hours into flight");
  });

  it("handles zero offset", () => {
    expect(formatFlightOffset(0)).toBe("As soon as you can");
  });
});

describe("formatFlightPhase", () => {
  it("identifies early/mid/late phases", () => {
    expect(formatFlightPhase(2, 17)).toBe("Early in flight");
    expect(formatFlightPhase(8, 17)).toBe("Mid-flight");
    expect(formatFlightPhase(13, 17)).toBe("Later in flight");
  });
});
```

### Phase 4: Stay Awake Guidance (Optional Enhancement)

**Frontend synthesis approach:**

```typescript
// src/lib/inflight-utils.ts
export function synthesizeStayAwakePeriods(
  inFlightInterventions: Intervention[]
): Intervention[] {
  // Detect gaps between sleep windows
  // Generate "stay awake" guidance cards
  // Return as additional interventions to display
}
```

**Total Estimate:** ~6-8 hours (1 day)

## Questions to Answer

1. **Visual distinction:** Should in-flight sleep be visually different from regular naps?
   - **Recommendation:** Yes - sky blue + plane icon

2. **Stay awake guidance:** Show periods between sleep windows?
   - **Recommendation:** Yes for completeness, but can defer to v2

3. **Information density:** How much detail in each card?
   - **Recommendation:** Moderate - times + progress bar + phase label

4. **Flight offset vs destination time:** Which should be primary?
   - **Recommendation:** Show both equally prominently

5. **Progress bar:** Include mini flight progress bar?
   - **Recommendation:** Yes if flight duration available, skip otherwise

## Files to Create/Modify

| File                                              | Action | Description                     |
| ------------------------------------------------- | ------ | ------------------------------- |
| `src/components/schedule/inflight-sleep-card.tsx` | Create | New enhanced card component     |
| `src/components/schedule/day-section.tsx`         | Modify | Conditional rendering           |
| `src/lib/intervention-utils.ts`                   | Modify | Add in-flight styling utilities |
| `src/lib/__tests__/inflight-utils.test.ts`        | Create | Unit tests                      |

## Verification Steps

### Test Flight Routes

- **SQ31 SFO→SIN:** 17h (should show ULR enhanced cards)
- **CX871 SFO→HKG:** 15h (should show ULR enhanced cards)
- **QF93 LAX→SYD:** 15h (should show ULR enhanced cards)
- **VS25 SFO→LHR:** 10.5h (should NOT show ULR, standard display)

### Manual Testing

1. Generate schedule for SFO → SIN (17h flight)
2. Navigate to Flight day in timeline
3. Verify two sleep windows appear with enhanced styling
4. Verify sky-blue gradient background
5. Verify plane icon in title
6. Verify flight offset badge visible
7. Verify responsive on mobile (375px)

### Automated Testing

```bash
bun run typecheck
bun run test:run
```

## Success Criteria

- [ ] In-flight sleep windows have distinct visual style from regular naps
- [ ] Plane icon clearly indicates "this is during flight"
- [ ] Flight offset is prominent (not hidden in small text)
- [ ] Both flight offset and destination time visible
- [ ] Standard naps unchanged (only affects in-flight)
- [ ] Works on 12h+ flights (SFO-HKG, SFO-SIN, LAX-SYD)
- [ ] Doesn't appear for shorter flights (<12h)
- [ ] Mobile responsive
- [ ] All tests pass
