# Schedule Display UI - Sprint Backlog Item

## Overview

Enhance the schedule display page (`/trip/[id]`) with interactive checkboxes and progress tracking. The core timeline rendering is already ~70% complete.

## Current State (What Exists)

**Fully Working:**
- Complete timeline rendering with day sections
- All intervention card types (light, caffeine, melatonin, sleep, exercise)
- Flight event cards (departure/arrival)
- "Now" marker with animated pulsing beacon
- Day navigation buttons with scroll-to-section
- Timezone transitions for same-day arrivals
- Nested wake_target grouping (visual hierarchy)
- Pre-trip and post-trip states
- Auto-scroll to current position
- Responsive mobile layout
- Phase-aware timezone display

**Components Built:**
- `schedule-header.tsx` - Trip summary with route/shift
- `day-section.tsx` - Timeline with vertical line
- `intervention-card.tsx` - Individual intervention display
- `wake-target-card.tsx` - Nested intervention grouping
- `flight-card.tsx` - Departure/arrival events
- `now-marker.tsx` - Current time indicator
- `timezone-transition.tsx` - Visual timezone divider
- `journey-states.tsx` - Post-trip celebration + error states

## What Needs to Be Built

### 1. Interactive Checkboxes (30% of work)
- Circular checkbox on left of each intervention card
- Completed state: checkmark, strikethrough, reduced opacity
- Persist in localStorage (keyed by schedule ID)
- Works with nested wake_target children

### 2. Progress Bar (30% of work)
- Shows "Today's progress • X / Y"
- Green fill bar proportional to completion
- Only visible during active trip (not pre/post)
- Positioned below day navigation buttons

### 3. Missing shadcn/ui Components (10% of work)
```bash
bunx shadcn@latest add checkbox progress tooltip
```

### 4. Footer Button Functionality (20% of work)
- "Add to Calendar" - Show tooltip "Coming soon" (blocked by auth)
- "Sign in to Save" - Blocked by auth (keep as placeholder)

### 5. Save Banner Functionality (10% of work)
- Blue gradient banner "Sign in" button - Blocked by auth

## Implementation Plan

### Phase 1: Add UI Primitives (~15 min)
```bash
bunx shadcn@latest add checkbox progress tooltip
```

### Phase 2: State Management (~30 min)
**File:** `src/lib/schedule-storage.ts`

Add completion tracking functions:
```typescript
// Key format: dawnward_completion_{departure_datetime}
// Store: {day}-{time}-{type} → boolean

export function getCompletionState(scheduleKey: string): Record<string, boolean>;
export function setInterventionComplete(scheduleKey: string, interventionId: string, complete: boolean): void;
export function clearCompletionState(scheduleKey: string): void;
```

### Phase 3: Interactive Checkboxes (~45 min)
**Files to modify:**
- `src/components/schedule/intervention-card.tsx` - Add checkbox + completed styling
- `src/components/schedule/day-section.tsx` - Pass completion state
- `src/app/trip/page.tsx` - Manage completion state

### Phase 4: Progress Bar (~45 min)
**File to create:** `src/components/schedule/progress-bar.tsx`

Calculate completion for current day only, render between day navigation and timeline.

### Phase 5: Footer Improvements (~20 min)
Add tooltips to disabled buttons, document auth integration points.

### Phase 6: Testing (~30 min)
- Verify persistence across reloads
- Test nested checkboxes
- Mobile layout verification

**Total Estimate:** ~3 hours

## Questions to Answer

1. **Schedule ID:** Should we use `departure_datetime` as the localStorage key? (Simple and works for anonymous users)

2. **Completion Expiration:** Should we auto-clean localStorage for trips older than arrival + adaptation days?

3. **Progress Scope:** Track only today's interventions (per design spec)? Or show overall trip progress too?

4. **Flight Event Checkboxes:** Should departure/arrival cards be checkable, or are they informational only?
   - **Recommendation:** Informational only

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/schedule-storage.ts` | Modify | Add completion tracking functions |
| `src/components/schedule/progress-bar.tsx` | Create | New progress bar component |
| `src/components/schedule/intervention-card.tsx` | Modify | Add checkbox + completed state |
| `src/components/schedule/day-section.tsx` | Modify | Wire completion state |
| `src/app/trip/page.tsx` | Modify | Manage completion state |
| `src/lib/__tests__/schedule-storage.test.ts` | Modify | Add completion tests |

## Verification Steps

1. `bunx shadcn@latest add checkbox progress tooltip` - Components install
2. `bun run typecheck` - No type errors
3. `bun run test:run` - All tests pass
4. Manual test: Generate schedule, check interventions, reload page, verify persistence
5. Manual test: Verify progress bar updates
6. Manual test: Test on mobile viewport

## Success Criteria

- [ ] Checkboxes appear on all intervention cards
- [ ] Clicking checkbox toggles completed state with visual feedback
- [ ] Completion persists across page reloads
- [ ] Progress bar shows current day completion
- [ ] Nested interventions under wake_target are checkable
- [ ] Mobile layout works correctly
- [ ] All existing tests pass
