# Summarized Day Views - Sprint Backlog Item

> A condensed schedule view for quick reference, email/calendar foundation, and reduced visual overwhelm.

---

## Problem Statement

The current detailed view shows each intervention as a full card with icon, title, description, and time. For an 8-day trip with 4-5 interventions per day, that's 32-40 cards to scroll through. Users need:

1. **Quick morning reference** - "What are my 4 things today?"
2. **Email/calendar-ready format** - Compact representation for notifications
3. **Less overwhelming UI** - Especially for longer trips or anxious travelers

---

## Design Direction (from user input)

| Decision            | Choice                                                     |
| ------------------- | ---------------------------------------------------------- |
| View mode           | **Hybrid** - Summary by default, tap day to expand details |
| Content level       | **Icon + time + mini description**                         |
| Tiering integration | **TBD** - Explore options below                            |

---

## Summary Card Design

### Visual Concept

A single card per day that contains all interventions in a scannable list format:

**Regular prep day (collapsed):**

```
┌─────────────────────────────────────────────────────┐
│  DAY -2 • Sunday, January 18                    ▼   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ☀️  6:00 AM   Wake up to help shift your clock     │
│  ☕  1:00 PM   Last caffeine for today              │
│  💊  2:00 PM   Take melatonin to shift earlier      │
│  🌙  9:00 PM   Aim for sleep by this time           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Flight day (collapsed with sub-sections):**

```
┌─────────────────────────────────────────────────────┐
│  FLIGHT DAY • Monday, January 20                ▼   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  BEFORE BOARDING                                    │
│  ☀️  5:00 AM   Get bright light before leaving      │
│  ✈️  11:30 AM  SFO → LHR departs                    │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                     │
│  ON THE PLANE (10.5 hr flight)                      │
│  😴  +0-6 hr   Sleep window (it's night in London)  │
│  ☀️  +6-10 hr  Stay awake (it's morning in London)  │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                     │
│  AFTER LANDING (3:45 PM London)                     │
│  ☀️  Immediate Get outside for afternoon light      │
│  💊  9:00 PM   Take melatonin                       │
│  🌙  9:30 PM   Aim for sleep by this time           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Minimal shift (tips card only, no expand):**

```
┌─────────────────────────────────────────────────────┐
│  SFO → DEN • +1 hour shift                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  💡 Minor Adjustment                                │
│                                                     │
│  A 1-hour shift needs no special preparation.       │
│  Your body adjusts naturally within a day.          │
│                                                     │
│  Quick tips:                                        │
│  • Get some light after landing                     │
│  • Stay awake until local bedtime                   │
│  • You'll feel normal by tomorrow                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Tier defaults visualization:**

```
MINIMAL (0-2h)     LIGHT (3h)        MODERATE (4-6h)   SIGNIFICANT (7-9h)  SEVERE (10-12h)
┌──────────┐       ┌──────────┐      ┌──────────┐      ┌──────────┐        ┌──────────┐
│ Tips     │       │ Summary  │      │ Summary  │      │ Summary  │        │ Detailed │
│ Card     │       │ ▼        │      │ ▼        │      │ ▼        │        │          │
│          │       │ 4 items  │      │ 4 items  │      │ 5 items  │        │ [cards]  │
│ (static) │       │          │      │          │      │ Flight ▲ │        │ [cards]  │
└──────────┘       └──────────┘      └──────────┘      └──────────┘        └──────────┘
No expand          Can expand        Can expand        Flight day          Can collapse
                                                       auto-expands
```

### Anatomy

1. **Header row**: Day label + date + expand/collapse chevron
2. **Intervention rows**: Icon + time + condensed description (one line)
3. **Optional footer**: Progress indicator or "X of Y complete" when tracking actuals

### Content Mapping

Current detailed descriptions → Condensed versions:

| Type              | Current Description                                                                                                              | Condensed                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `wake_target`     | "Try to wake up at this time to help shift your circadian clock. Get bright light soon after waking."                            | "Wake up to help shift your clock" |
| `light_seek`      | "Get outside or use a light box for 30+ minutes of bright light."                                                                | "Get 30+ min bright light"         |
| `light_avoid`     | "Avoid bright light and screens. Wear blue blockers if needed."                                                                  | "Avoid bright light, dim screens"  |
| `caffeine_cutoff` | "Avoid caffeine from now on to protect tonight's sleep. Caffeine's half-life is ~6 hours."                                       | "Last caffeine for today"          |
| `caffeine_ok`     | "Coffee and tea are fine until your cutoff time."                                                                                | "Caffeine OK until cutoff"         |
| `caffeine_boost`  | "Strategic caffeine can help you stay alert when needed."                                                                        | "Use caffeine to stay alert"       |
| `melatonin`       | "Take 0.5mg fast-release melatonin now. This timing shifts your body clock earlier—it's not meant to make you sleepy right now." | "Take melatonin to shift earlier"  |
| `sleep_target`    | "Aim to be in bed with lights out at this time. Dim lights 1-2 hours before to prepare for sleep."                               | "Aim for sleep by this time"       |
| `nap_window`      | "This is an optimal window for a brief nap if needed."                                                                           | "Good window for a short nap"      |

### Interaction

**Tap day header or chevron** → Expands to show full detailed cards (current view)
**Tap again** → Collapses back to summary

Animation: Smooth accordion expand/collapse with slight spring.

---

## Component Architecture

### New Components

| Component                | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `DaySummaryCard`         | Single collapsed day with intervention list |
| `SummaryInterventionRow` | Icon + time + condensed text row            |
| `ExpandableDay`          | Wrapper handling expand/collapse state      |

### Modified Components

| Component       | Change                                                           |
| --------------- | ---------------------------------------------------------------- |
| `DaySection`    | Add collapsed state, delegate to `DaySummaryCard` when collapsed |
| `schedule-page` | Track expanded days in state, default all collapsed              |

### Data Flow

```
Schedule Page
├── expanded: Set<number>  // day offsets that are expanded
├── viewMode: 'summary' | 'detailed'  // user preference
│
└── DaySection (for each day)
    ├── if expanded → current full render
    └── if collapsed → DaySummaryCard
        └── SummaryInterventionRow × N
```

---

## Tiering Integration Options

### Option A: Independent Features

**Summary view** and **shift tiering** are orthogonal:

- Tiering controls **what** shows (full schedule vs tips card)
- Summary controls **how** it displays (cards vs list)

```
Minimal (0-2h):  Tips card only (no schedule)
Light (3h):     Summary OR detailed (user choice)
Moderate+:      Summary OR detailed (user choice)
```

**Pros:**

- Simpler mental model
- Users control their own experience
- Features can ship independently

**Cons:**

- Missed opportunity for smart defaults
- User has to understand two different simplification concepts

### Option B: Minimal Shifts Force Summary

For **0-2h shifts**, show only summary view (no expand option):

```
Minimal (0-2h):  Summary only (can't expand, it's just tips anyway)
Light (3h):     Summary default, can expand
Moderate+:      Summary default, can expand
```

**Pros:**

- Very simple experience for minimal shifts
- Reinforces "you don't need a complex schedule"

**Cons:**

- Removes user agency for minimal shifts
- Inconsistent behavior across tiers

### Option C: Design Together (Recommended)

Treat both as one **"schedule simplification"** system with smart defaults:

| Tier               | Default View | Expand Available                                     | Rationale                        |
| ------------------ | ------------ | ---------------------------------------------------- | -------------------------------- |
| Minimal (0-2h)     | Tips card    | No                                                   | No real schedule needed          |
| Light (3h)         | Summary      | Yes (shows "mostly the same as your normal routine") | Light guidance                   |
| Moderate (4-6h)    | Summary      | Yes                                                  | Quick reference preferred        |
| Significant (7-9h) | Summary      | Yes, starts expanded on flight day                   | More detail for complex shifts   |
| Severe (10-12h)    | Detailed     | Can collapse                                         | Full guidance for extreme shifts |

**Pros:**

- Intelligent defaults based on trip complexity
- Progressive disclosure matches user need
- Single coherent "smart schedule" narrative

**Cons:**

- More complex implementation
- Requires tiering to ship first (or together)

---

## Email/Calendar Reuse

### Shared Format

The summary card format maps directly to email and calendar:

**Morning email:**

```
Good morning, David.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SATURDAY, JAN 18 — Day -2 of prep
SFO → London in 2 days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

☀️  6:00 AM   Wake up to help shift your clock
☕  1:00 PM   Last caffeine for today
💊  2:00 PM   Take melatonin to shift earlier
🌙  9:00 PM   Aim for sleep by this time

[View Full Schedule →]
```

**Calendar event description:**

```
Today's jet lag plan:
☀️ 6:00 AM - Wake up to help shift your clock
☕ 1:00 PM - Last caffeine for today
💊 2:00 PM - Take melatonin to shift earlier
🌙 9:00 PM - Aim for sleep by this time
```

### Implementation Approach

Create a shared `formatDayForText()` utility:

```typescript
function formatDayForText(day: DaySchedule): string {
  return day.items
    .map((intervention) => {
      const icon = getInterventionEmoji(intervention.type);
      const time = formatTime(getDisplayTime(intervention));
      const desc = getCondensedDescription(intervention.type);
      return `${icon}  ${time}   ${desc}`;
    })
    .join("\n");
}
```

Used by:

- `DaySummaryCard` component (web)
- Email template generation
- Calendar event builder

---

## Mobile Considerations

### Summary View Benefits Mobile

- Less scrolling (4-5 rows vs 4-5 full cards)
- One-thumb operation (tap to expand specific days)
- Better for quick glances in transit

### Responsive Behavior

- Mobile: Summary as strong default
- Desktop: Could show side-by-side (summary left, expanded day right) - future enhancement

---

## Accessibility

- Expand/collapse must be keyboard accessible (Enter/Space)
- Screen readers should announce "Day -2, 4 interventions, collapsed" and "expanded"
- ARIA: `aria-expanded`, `aria-controls`
- Focus management: After expand, focus moves to first intervention card

---

## Decisions Made

1. **Tiering integration**: **Option C - Design Together**
   - Smart defaults per tier (severe=detailed, light=summary)
   - Ship tiering + summary as one coherent feature

2. **Actuals in summary**: **No actuals in summary**
   - Summary is read-only reference
   - Must expand to see completion status or record changes
   - Keeps summary clean and focused

3. **Flight day treatment**: **Show sub-sections in summary**
   - Display structure like: "Before boarding (2) • On plane (3) • After landing (2)"
   - Gives user a sense of the day's complexity
   - Tap to expand reveals full detail

4. **Dual timezone in summary**: No (keeps it scannable)
   - Dual timezone only shown when expanded

5. **Animation**: 200-250ms with spring easing

---

## Current State

- **Prototype complete**: `DaySummaryCard` component built and tested at `/demo/summary-card`
- **Branch**: `feature/summarized-day-views`
- **Files created**:
  - `src/components/schedule/day-summary-card.tsx` - Main component with `DaySummaryCard`, `SummaryInterventionRow`, `FlightSubSectionHeader`, `FlightEventRow`, and `formatDayForText()` export
  - `src/app/demo/summary-card/page.tsx` - Demo page with mock data
- **Not yet integrated**: Schedule page, user preferences, tiering

---

## Implementation Plan

### Task 1: Integrate DaySummaryCard into Schedule Page

**Goal**: Replace current always-expanded view with summary-by-default + expand on click

**File:** `src/app/trip/[id]/page.tsx`

Changes:

- Add `expandedDays: Set<number>` state to track which days are expanded
- Pass `isExpanded` and `onExpandChange` props to day rendering
- Default all days to collapsed (summary view)

**File:** `src/components/schedule/day-section.tsx`

Changes:

- Add `isExpanded` and `onExpandChange` props
- When collapsed, render `DaySummaryCard` instead of full timeline
- When expanded, render current detailed view (wrapped in `DaySummaryCard.renderExpanded`)

```tsx
// New props for DaySection
interface DaySectionProps {
  // ... existing props
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  viewMode?: "summary" | "detailed";
}
```

**File:** `src/components/schedule/schedule-display.tsx` (if exists) or equivalent

Changes:

- Manage expanded state for all days
- Handle "expand all" / "collapse all" actions (optional)

### Task 2: User Preference for View Mode

**Goal**: Let signed-in users choose their preferred default view

**File:** `src/types/user-preferences.ts`

Add new preference:

```typescript
export interface UserPreferences {
  // ... existing
  scheduleViewMode?: "summary" | "detailed"; // NEW - default: 'summary'
}
```

**File:** `prisma/schema.prisma`

Update User model to include `scheduleViewMode` in preferences JSON.

**File:** `src/app/settings/page.tsx`

Add toggle in Display Preferences section:

```
Schedule View
○ Summary (compact list, tap to expand)  [default]
○ Detailed (full cards with timeline)
```

**File:** `src/app/api/user/preferences/route.ts`

Ensure new field is handled in GET/PUT.

### Task 3: Connect to Real DaySection for Expanded View

**Goal**: When expanded, show actual `DaySection` content (not placeholder)

**File:** `src/components/schedule/day-summary-card.tsx`

The `renderExpanded` prop is already supported. Parent component passes actual `DaySection` render.

**File:** `src/app/trip/[id]/page.tsx` or schedule container

```tsx
<DaySummaryCard
  daySchedule={day}
  // ... other props
  isExpanded={expandedDays.has(day.day)}
  onExpandChange={(expanded) => toggleExpanded(day.day)}
  renderExpanded={() => (
    <DaySection
      daySchedule={day}
      // ... all existing DaySection props
    />
  )}
/>
```

### Task 4: Tiering Integration (Option C)

**Dependency**: Requires shift-threshold-tiering.md to be implemented first (or implement together)

**Goal**: Smart defaults based on shift magnitude

**File:** `src/lib/schedule-display-utils.ts` (new)

```typescript
import type { ShiftTier } from "@/types/schedule";

export function getDefaultViewMode(tier: ShiftTier): "summary" | "detailed" {
  return tier === "severe" ? "detailed" : "summary";
}

export function shouldAutoExpandFlightDay(tier: ShiftTier): boolean {
  return tier === "significant" || tier === "severe";
}

export function canExpand(tier: ShiftTier): boolean {
  return tier !== "minimal"; // Minimal tier shows tips card only
}
```

**File:** `src/app/trip/[id]/page.tsx`

Apply tier-based defaults:

```typescript
const defaultExpanded = new Set<number>();
if (shouldAutoExpandFlightDay(schedule.shift_tier)) {
  defaultExpanded.add(0); // Flight day
}
const [expandedDays, setExpandedDays] = useState(defaultExpanded);
```

### Task 5: Shared Trip View Integration

**Goal**: Shared trips (`/s/[code]`) use summary view by default

**File:** `src/app/s/[code]/page.tsx`

Same pattern as trip page - summary by default, expandable.

### Task 6: Tests

**File:** `src/components/schedule/__tests__/day-summary-card.test.tsx` (new)

Test cases:

- Renders correct number of intervention rows
- Flight day shows sub-sections (Before Boarding, On Plane, After Landing)
- Flight offset times render as "~X hours into flight"
- Expand/collapse toggles correctly
- `formatDayForText()` produces expected emoji + time + description format
- Handles empty day (no interventions)
- Header shows correct day label and date

**File:** `src/lib/__tests__/schedule-display-utils.test.ts` (new)

Test cases:

- `getDefaultViewMode()` returns 'detailed' only for severe tier
- `shouldAutoExpandFlightDay()` returns true for significant/severe
- `canExpand()` returns false only for minimal tier

### Task 7: Delete Demo Page

**Goal**: Remove temporary demo page before merge

**File:** `src/app/demo/summary-card/page.tsx`

Delete after integration is complete.

---

## File Summary

| File                                                          | Action       | Purpose                                                   |
| ------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| `src/components/schedule/day-summary-card.tsx`                | ✅ Created   | Main summary card component                               |
| `src/app/demo/summary-card/page.tsx`                          | Delete after | Temporary demo page                                       |
| `src/app/trip/[id]/page.tsx`                                  | Modify       | Add expand state, use DaySummaryCard                      |
| `src/app/s/[code]/page.tsx`                                   | Modify       | Same as trip page                                         |
| `src/components/schedule/day-section.tsx`                     | Modify       | Accept expanded state, delegate to summary when collapsed |
| `src/types/user-preferences.ts`                               | Modify       | Add `scheduleViewMode` preference                         |
| `prisma/schema.prisma`                                        | Modify       | Include new preference field                              |
| `src/app/settings/page.tsx`                                   | Modify       | Add view mode toggle                                      |
| `src/app/api/user/preferences/route.ts`                       | Modify       | Handle new preference                                     |
| `src/lib/schedule-display-utils.ts`                           | Create       | Tier-based display logic                                  |
| `src/components/schedule/__tests__/day-summary-card.test.tsx` | Create       | Component tests                                           |
| `src/lib/__tests__/schedule-display-utils.test.ts`            | Create       | Utility tests                                             |

---

## Success Metrics

- **Reduced scroll depth** on schedule pages (measure scroll distance)
- **Faster time-to-comprehension** for daily plan (qualitative feedback)
- **Email open/engagement rates** once emails ship
- **User preference adoption** (how many keep summary vs switch to detailed)

---

## Dependencies

- **Shift Threshold Tiering** (`shift-threshold-tiering.md`): Required for Task 4 (tiering integration)
  - Can ship Tasks 1-3 independently
  - Tasks 4+ require `shift_tier` field in API response

---

## Risks & Mitigations

| Risk                                         | Mitigation                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Performance: Re-rendering on expand/collapse | Use React.memo on DaySummaryCard, lazy load DaySection content                  |
| Accessibility: Screen reader confusion       | Ensure aria-expanded and aria-controls are correctly set (already in prototype) |
| Mobile: Tap target too small                 | Header is full-width button, should be sufficient                               |

---

## Open Questions

1. **Animation**: Current prototype has no expand/collapse animation. Add framer-motion or CSS transitions?
2. **"Expand All" button**: Should we add a button to expand all days at once?
3. **URL state**: Should expanded days be reflected in URL for sharing? (Probably not needed)
