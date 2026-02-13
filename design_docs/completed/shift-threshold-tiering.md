# Shift Threshold Tiering - Sprint Backlog Item

## Overview

Implement a 5-tier system that provides differentiated UI treatment based on timezone shift magnitude. A 2-hour shift needs completely different guidance than a 9-hour shift.

| Tier        | Shift  | Label               | Default Prep | Strategy                         |
| ----------- | ------ | ------------------- | ------------ | -------------------------------- |
| Minimal     | 0-2h   | "Minor adjustment"  | 0 days       | Tips card only                   |
| Light       | 3h     | "Light shift"       | 2 days       | Simplified schedule              |
| Moderate    | 4-6h   | "Moderate shift"    | 3 days       | Full schedule                    |
| Significant | 7-9h   | "Significant shift" | 5 days       | Full schedule + warnings         |
| Severe      | 10-12h | "Major shift"       | 7 days       | Full schedule + direction choice |

## Current State

- **Shift calculation**: `circadian_math.py:calculate_timezone_shift()` already computes shift hours and direction
- **Schedule generation**: `scheduler_v2.py` generates full schedule for all shifts regardless of magnitude
- **Frontend display**: `trip/page.tsx` shows full timeline for every schedule
- **No tier awareness**: Backend doesn't classify shifts, frontend shows same UI for 1h and 12h shifts

## Architecture Decision

**Hybrid approach:**

- **Backend**: Calculate tier, include in `ScheduleResponse`, filter interventions per tier
- **Frontend**: Read `shift_tier` from API response, render appropriate UI components

**Why**: Single source of truth for tier boundaries in Python, UI flexibility in React.

## Implementation Plan

### Phase 1: Backend - Add Tier Detection (~2 hours)

**File:** `api/_python/circadian/types.py`

```python
ShiftTier = Literal["minimal", "light", "moderate", "significant", "severe"]

@dataclass
class ScheduleResponse:
    total_shift_hours: float
    direction: Literal["advance", "delay"]
    shift_tier: ShiftTier  # NEW
    estimated_adaptation_days: int
    # ... rest unchanged
```

**File:** `api/_python/circadian/scheduler_v2.py`

Add tier detection method:

```python
def _determine_shift_tier(self, total_shift: float) -> ShiftTier:
    abs_shift = abs(total_shift)
    if abs_shift <= 2: return "minimal"
    elif abs_shift == 3: return "light"
    elif 4 <= abs_shift <= 6: return "moderate"
    elif 7 <= abs_shift <= 9: return "significant"
    else: return "severe"  # 10-12h
```

**File:** `api/_python/tests/test_shift_tiering.py` - New tests for tier boundaries

### Phase 2: Backend - Filter Interventions for Light Tier (~1 hour)

Per design doc: "Only include light and melatonin interventions (no caffeine optimization for light shifts)."

**File:** `api/_python/circadian/scheduling/intervention_planner.py`

Update to skip caffeine logic when `tier == "light"`.

### Phase 3: Frontend Types (~30 min)

**File:** `src/types/schedule.ts`

```typescript
export type ShiftTier =
  | "minimal"
  | "light"
  | "moderate"
  | "significant"
  | "severe";

export interface ScheduleResponse {
  // ... existing fields
  shift_tier: ShiftTier; // NEW
}
```

### Phase 4: Frontend UI Components (~4 hours)

**New components to create:**

| Component                     | Tier               | Purpose                              |
| ----------------------------- | ------------------ | ------------------------------------ |
| `minimal-shift-card.tsx`      | Minimal            | Tips card with "No prep needed"      |
| `light-shift-footer.tsx`      | Light              | "Skip prep? That's fine" reassurance |
| `prep-warning-card.tsx`       | Significant/Severe | Warning when under-prepared          |
| `arrival-adaptation-card.tsx` | Significant/Severe | Post-arrival expectations            |
| `direction-choice-card.tsx`   | Severe             | Advance vs delay explanation         |

### Phase 5: Frontend Trip Page Integration (~3 hours)

**File:** `src/app/trip/page.tsx`

- **Minimal tier**: Show only `MinimalShiftCard`, no schedule timeline
- **Light tier**: Full schedule + `LightShiftFooter`
- **Moderate tier**: Full schedule, no special treatment
- **Significant tier**: Full schedule + `PrepWarningCard` (if under-prepared) + `ArrivalAdaptationCard`
- **Severe tier**: Full schedule + `DirectionChoiceCard` + all warnings

### Phase 6: Form Prep Days Hint (Optional, ~2 hours)

**File:** `src/components/trip-form.tsx`

Show recommended prep days based on detected shift tier.

**Total Estimate:** ~16 hours (2 days)

## Questions to Answer

1. **Caffeine filtering for LIGHT tier**: Should backend skip caffeine interventions, or should frontend hide them?
   - **Recommendation:** Backend should skip them (cleaner separation)

2. **Minimal tier localStorage handling**: User generates 8h schedule, then edits to 1h. What happens?
   - **Recommendation:** Auto-regenerate on origin/destination mismatch

3. **Direction choice for SEVERE tier**: Informational only or interactive?
   - **Recommendation:** Informational only for MVP (shows what backend chose and why)

4. **LIGHT tier boundary**: Is 3.5h "light" or "moderate"?
   - **Recommendation:** LIGHT is exactly 3h. Anything ≥3.1h is MODERATE.

5. **Remaining shift calculation**: How to show "you'll arrive with ~4h jet lag"?
   - **Recommendation:** Use `totalShift - (prepDays × dailyRate)` where dailyRate varies by direction

## Files to Create/Modify

### Backend (Python)

| File                                                       | Action | Description                                |
| ---------------------------------------------------------- | ------ | ------------------------------------------ |
| `api/_python/circadian/types.py`                           | Modify | Add `ShiftTier`, update `ScheduleResponse` |
| `api/_python/circadian/scheduler_v2.py`                    | Modify | Add `_determine_shift_tier()`              |
| `api/_python/circadian/scheduling/intervention_planner.py` | Modify | Filter caffeine for light tier             |
| `api/_python/tests/test_shift_tiering.py`                  | Create | Tier boundary tests                        |

### Frontend (TypeScript)

| File                                                  | Action | Description                  |
| ----------------------------------------------------- | ------ | ---------------------------- |
| `src/types/schedule.ts`                               | Modify | Add `ShiftTier` type         |
| `src/components/schedule/minimal-shift-card.tsx`      | Create | Tips card for 0-2h           |
| `src/components/schedule/light-shift-footer.tsx`      | Create | Reassurance for 3h           |
| `src/components/schedule/prep-warning-card.tsx`       | Create | Under-preparation warning    |
| `src/components/schedule/arrival-adaptation-card.tsx` | Create | Post-arrival expectations    |
| `src/components/schedule/direction-choice-card.tsx`   | Create | 10-12h direction info        |
| `src/app/trip/page.tsx`                               | Modify | Tier-aware rendering (major) |

## Verification Steps

### Test Scenarios

| Route              | Shift | Tier        | Expected UI                                |
| ------------------ | ----- | ----------- | ------------------------------------------ |
| DEN → ORD          | 1h    | Minimal     | Tips card only                             |
| LAX → JFK          | 3h    | Light       | Schedule + reassurance footer              |
| JFK → LHR          | 5h    | Moderate    | Full schedule, no extras                   |
| SFO → LHR (3 prep) | 8h    | Significant | Schedule + prep warning + adaptation card  |
| SFO → LHR (5 prep) | 8h    | Significant | Schedule + adaptation card (no warning)    |
| SFO → SIN          | 16h   | Severe      | Schedule + direction choice + all warnings |

### Commands

```bash
# Backend tests
bun run test:python

# Frontend tests
bun run test:run

# Type check
bun run typecheck
```

## Integration with Summarized Day Views

The expand/collapse behavior in `DaySummaryCard` may need tier-aware adjustments:

- **Minimal tier**: Consider showing tips card only (no expandable days)
- **Light tier**: May auto-expand all days since schedule is simpler
- **Moderate+**: Current behavior (summary mode with today expanded)

> **Note:** `scheduleViewMode` was removed. View mode is now viewport-driven (desktop=expanded, mobile=collapsed). Tier interactions apply to the mobile collapsed view only.

## Success Criteria

- [ ] Backend returns `shift_tier` in `ScheduleResponse`
- [ ] Minimal tier (0-2h): Tips card only, no schedule
- [ ] Light tier (3h): Schedule + reassurance footer, no caffeine interventions
- [ ] Moderate tier (4-6h): Full schedule, no special treatment
- [ ] Significant tier (7-9h): Prep warning (if under-prepared) + adaptation card
- [ ] Severe tier (10-12h): Direction choice + all warnings
- [ ] All tier boundaries have tests
- [ ] Mobile responsive for all new cards
- [ ] Tier-aware expand/collapse behavior integrates with `DaySummaryCard`
