# Actuals Recording: Future UX Ideas

Observations and ideas from testing the trip editing feature (January 2026).

---

## Current Behavior

### What Works Well

- **Tense-aware copy** — Past interventions show "Done as planned", future show "Will do as planned"
- **Skip restriction** — Wake/sleep targets can't be skipped (schedule anchors)
- **15-minute intervals** — Time picker constrains choices appropriately
- **Visual feedback** — Modified times show in teal with strikethrough on original

### Current Limitations

- **Nested cards not clickable** — Informational cards like "Seek bright light" and "Caffeine OK" nested inside wake time aren't individually clickable. Users can only record actuals for the parent intervention.
- **One intervention at a time** — Must open modal for each intervention separately
- **No batch recording** — Can't mark multiple items as "done as planned" at once

---

## Future Ideas to Explore

### 1. Batch "Mark Day Complete" Button

Add a "Done for today" button at the day level that marks all remaining interventions as completed as planned. Useful for users who followed their schedule perfectly.

**Considerations:**
- Should it skip informational cards automatically?
- What about future interventions on the same day?
- Should it prompt for confirmation?

### 2. Individual Nested Card Actuals

Allow users to record actuals for nested items (like "Seek bright light") separately from the parent. This would be useful if someone woke up on time but skipped their light therapy.

**Considerations:**
- Would need to track nested vs. standalone display state
- Might complicate the cascade behavior for parents
- Is this granularity actually useful to users?

### 3. Offline Actuals Recording

Store actuals locally when offline and sync when reconnected. Useful for travelers without reliable internet.

**Implementation approach:**
- IndexedDB for local storage
- Sync queue with conflict resolution
- Visual indicator for "pending sync" items

### 4. Quick Actions on Cards

Instead of opening a modal, allow quick tap actions:
- Single tap → "Done as planned"
- Long press → Open full modal for modifications

**Considerations:**
- Discoverability of long-press
- Accidental taps
- Accessibility concerns

### 5. Daily Summary View

After a day completes, show a summary comparing planned vs. actual:

```
Day -2 Summary
✓ Wake: 6:00 AM (as planned)
⚡ Melatonin: 1:30 PM (+30 min late)
✓ Sleep: 9:15 PM (modified from 9:00 PM)
```

Could help users understand their adherence patterns.

### 6. Proactive Reminders

Push notification or in-app prompt when approaching an intervention time:
- "Melatonin in 15 minutes (1:00 PM)"
- Quick action to dismiss or snooze

**Requires:** Push notification infrastructure (PWA or native)

### 7. Adherence Score

Calculate and display an adherence percentage based on recorded actuals:
- 100% = all done as planned
- Weighted by intervention importance (wake/sleep > melatonin > caffeine)

Could motivate users to stick to the schedule.

---

## Technical Notes

### Smart Deviation Algorithm

The `calculateDeviation` function in `actuals-utils.ts` handles cross-midnight times by assuming the smallest reasonable deviation (<12 hours):

```typescript
// Sleep target 23:00, actual 02:00 (next day)
// Naive: 02:00 - 23:00 = -21 hours (wrong!)
// Smart: -21 + 24 = +3 hours late (correct!)
```

This works well for sleep/wake times but might need adjustment for other intervention types if we expand actuals recording.

### Editable vs. Informational Interventions

Currently, only interventions with the pencil icon are editable:
- `wake_target`, `sleep_target` — editable, not skippable
- `melatonin` — editable, skippable
- `light_seek`, `light_avoid` — informational only (no actuals)
- `caffeine_ok`, `caffeine_cutoff` — informational only

Consider whether light interventions should become trackable in the future.

---

_Last updated: January 2026_
