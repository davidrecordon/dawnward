# Calendar vs Web App Display Decisions

This document captures the intentional differences between how schedules are displayed in the Dawnward web app vs how they're synced to Google Calendar.

## Design Philosophy

**Web app** prioritizes detail and nuance:

- Shows all interventions including advisory-only items
- Supports dual timezone display during transitions
- Preserves full intervention structure from scheduler

**Calendar** prioritizes actionability and cleanliness:

- Groups related items to reduce event clutter
- Filters out non-actionable items
- Uses explicit time blocks with durations

## Documented Differences

### 1. Intervention Filtering

**Web app:** Shows all intervention types including `caffeine_ok`
**Calendar:** Filters to "actionable" interventions only

`caffeine_ok` is explicitly filtered out because it's advisory ("you can drink coffee until X") rather than action-oriented. Users don't need a calendar reminder that they're allowed to do something.

```typescript
// google-calendar.ts
export function isActionableIntervention(type: InterventionType): boolean {
  return type !== "caffeine_ok";
}
```

### 2. Event Grouping Strategy

**Web app:** Flat list of individual interventions (except flight day which has Before/On/After sections)

**Calendar:** Anchor-based grouping with 2-hour window:

- Interventions within 2h of `wake_target` → "⏰ Wake up: Light + Melatonin"
- Interventions within 2h of `sleep_target` → "😴 Bedtime: Melatonin"

**Standalone types** that never group (critical timing):

- `caffeine_cutoff` - Mid-day, would be lost in morning routine
- `exercise` - Specific circadian timing
- `nap_window` - In-flight only, has offset hours
- `light_avoid` - Long duration (2-4h from PRC calculation)

**Result:** ~20 interventions become ~10 calendar events.

### 3. Duration Representation

**Web app:** Text descriptions only, durations not shown in summary view
**Calendar:** Explicit time blocks with calculated durations:

- `light_seek` → 30/45/60/90 min (user preference)
- `light_avoid` → 2-4h (PRC-calculated)
- `wake_target`/`sleep_target` → 15 min (point-in-time)
- `nap_window` → From intervention data

Grouped events use the longest duration among members.

### 4. Reminder Timing

Calendar events have type-specific reminders:
| Type | Reminder | Rationale |
|------|----------|-----------|
| `wake_target` | 0 min | Alarm IS the wake-up call |
| `sleep_target` | 30 min | Time to wind down |
| Others | 15 min | Default advance notice |

Events at the same time as `wake_target` also get 0-min reminders.

Web app doesn't display reminder timing (calendar-specific behavior).

### 5. Busy/Free Status

Calendar marks these as BUSY (blocks calendar):

- `nap_window` - Actual sleep period
- `exercise` - Physical activity time

Everything else is FREE (transparent) - users can double-book if needed.

Web app doesn't show this distinction.

### 6. Timezone Handling

**Web app:** Dual timezone display for in-transit phases:

- "9:00 AM PST / 5:00 PM GMT" with airplane icons
- Helps users understand the transition

**Calendar:** Single timezone per event (calendar limitation):

- Pre-flight phases → origin timezone
- Post-flight phases → destination timezone

### 7. Duplicate Wake Deduplication

When timezone transitions cause Day 1 and Day 2 to land on the same calendar date:

**Web app:** Shows both wake times (provides full detail)
**Calendar:** Deduplicates within 2h window:

- First wake wins (creates event)
- Second wake skipped
- Grouped items (melatonin) created as standalone events

This prevents confusing duplicate "wake up" events on the same calendar day.

## Summary Table

| Aspect          | Web App          | Calendar          | Rationale           |
| --------------- | ---------------- | ----------------- | ------------------- |
| `caffeine_ok`   | Shown            | Filtered          | Advisory only       |
| Grouping        | Individual items | Anchor-based      | Reduce clutter      |
| Durations       | Text only        | Time blocks       | Calendar native     |
| Reminders       | Not shown        | Type-specific     | Calendar native     |
| Busy/free       | Not shown        | Nap/exercise busy | Calendar native     |
| Dual timezone   | Supported        | Single            | Calendar limitation |
| Duplicate wakes | Both shown       | Deduplicated      | Prevent confusion   |

## Files Involved

**Web app display:**

- `src/components/schedule/day-summary-card.tsx`
- `src/components/schedule/intervention-card.tsx`
- `src/lib/schedule-utils.ts`

**Calendar sync:**

- `src/lib/google-calendar.ts`
- `src/app/api/calendar/sync/route.ts`

## Future Considerations

Optional enhancements that could improve transparency:

1. Show event count in sync UI: "Syncing 24 events from 35 interventions"
2. Add durations to web app summary view
3. Tooltip on sleep_target: "Reminds 30 min before"

These are not required - the current behavior is reasonable and each context serves its purpose.
