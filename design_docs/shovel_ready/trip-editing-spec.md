# Trip Editing & Adaptive Schedules: Implementation Spec

## Overview

Enable users to edit trips and track actual behavior, with schedule recalculation powered by the full Forger99 circadian model. This maintains scientific integrity—the same model generates initial schedules and handles adaptations.

### Core Capabilities

1. **Preference editing**: Change trip-level settings (caffeine, melatonin, intensity) → full schedule regeneration
2. **Actuals tracking**: Record what actually happened vs. planned → model-based recalculation
3. **State snapshots**: Persist oscillator state daily for efficient mid-trip recalculation
4. **Eight Sleep integration** (future): Automatic actuals from sleep data

---

## Constraints

### Authentication Required

Trip editing, actuals tracking, and recalculation require authentication. Anonymous users receive a generated schedule but cannot:

- Edit preferences
- Record actuals
- Receive recalculated schedules
- Connect Eight Sleep

This is consistent with the existing model where anonymous trips are ephemeral (localStorage-bridged, single generation).

### Default Compliance Assumption

**Interventions are assumed completed as planned unless the user explicitly records otherwise.**

The system does not prompt for confirmation or require check-offs—silence equals compliance. This keeps the UX lightweight while still enabling corrections when actual behavior diverged from the plan.

Implications:

- No "did you do this?" notifications
- Recalculation only triggers when user _reports_ a deviation
- Schedule remains stable unless user takes action
- Past days without recorded actuals are treated as fully compliant

### Eight Sleep: Future Scope

Eight Sleep integration is documented here for architectural completeness but is **not part of the initial implementation**. Phases 1-4 cover the core editing and recalculation flow; Phase 5 (Eight Sleep) comes later.

---

## Data Model

### Schema Changes

```prisma
model SharedSchedule {
  id        String   @id @default(cuid())

  // === Existing input fields ===
  originTz      String
  destTz        String
  departure     DateTime
  arrival       DateTime
  prepDays      Int      @default(3)
  wakeTime      String   @default("07:00")
  sleepTime     String   @default("23:00")
  usesMelatonin Boolean  @default(true)
  usesCaffeine  Boolean  @default(true)
  // ... other inputs

  // === Schedule storage (new) ===
  initialScheduleJson   Json?      // First generated schedule (frozen)
  currentScheduleJson   Json?      // Latest schedule (after recalcs)
  lastRecalculatedAt    DateTime?

  // === Relationships ===
  actuals        InterventionActual[]
  stateSnapshots ModelStateSnapshot[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model InterventionActual {
  id         String   @id @default(cuid())
  scheduleId String
  schedule   SharedSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  // === Structured key (not string parsing) ===
  legIndex         Int      @default(0)    // For multi-leg trips
  dayOffset        Int                      // -3, -2, -1, 0, 1, 2...
  interventionType String                   // "wake", "sleep", "light_seek", "light_avoid", "melatonin", "caffeine_last", "caffeine_first"

  // === Timing ===
  plannedTime String                        // "06:00" (HH:MM in relevant timezone)
  actualTime  String?                       // null = as_planned

  // === Status ===
  status String                             // "as_planned" | "modified" | "skipped"
  source String @default("manual")          // "manual" | "eight_sleep"

  recordedAt DateTime @default(now())

  @@unique([scheduleId, legIndex, dayOffset, interventionType])
  @@index([scheduleId])
}

model ModelStateSnapshot {
  id         String   @id @default(cuid())
  scheduleId String
  schedule   SharedSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  // === Position in trip ===
  legIndex  Int @default(0)
  dayOffset Int                             // Snapshot taken at END of this day

  // === Forger99 state vector ===
  x   Float                                 // Pacemaker activity
  xc  Float                                 // Complementary variable
  n   Float                                 // Photoreceptor drive

  // === Derived (for queries/debugging) ===
  cbTminHour Float                          // e.g., 4.5 = 4:30 AM local

  capturedAt DateTime @default(now())

  @@unique([scheduleId, legIndex, dayOffset])
  @@index([scheduleId])
}

// === FUTURE: Eight Sleep (Phase 5) ===
model EightSleepConnection {
  id           String   @id @default(cuid())
  userId       String   @unique
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  accessToken  String   // Encrypted
  refreshToken String   // Encrypted
  expiresAt    DateTime
  lastSyncAt   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Status Semantics

| Status       | actualTime | Meaning                            |
| ------------ | ---------- | ---------------------------------- |
| `as_planned` | `null`     | Did intervention at planned time   |
| `modified`   | required   | Did intervention at different time |
| `skipped`    | `null`     | Did not do intervention            |

Note: Most interventions will have **no record at all**—the absence of a record means "done as planned" per the default compliance assumption. Records are only created when the user explicitly reports something.

### Intervention Types

| Type             | Affects Circadian Model       | Notes                     |
| ---------------- | ----------------------------- | ------------------------- |
| `wake`           | Yes - light exposure start    | Primary anchor            |
| `sleep`          | Yes - light exposure end      | Primary anchor            |
| `light_seek`     | Yes - direct PRC input        | Window timing matters     |
| `light_avoid`    | Yes - prevents unwanted shift | Compliance binary         |
| `melatonin`      | Yes - phase shift ~0.5-1.5h   | Timing relative to CBTmin |
| `caffeine_first` | No - alertness only           | Track for UX completeness |
| `caffeine_last`  | No - alertness only           | Track for UX completeness |

---

## Recalculation Architecture

### Why Model-Based (Not Approximations)

The Forger99 model captures nonlinear phase response—identical light exposure produces different shifts depending on circadian phase. Linear approximations like "1 hour late = 0.7 hours less shift" discard this sophistication exactly when it matters most.

**Single source of truth**: The same `circadian` library generates initial schedules and handles recalculations.

### State Snapshot Strategy

Rather than replaying entire trips, we snapshot oscillator state daily:

```
Day -3: Generate schedule, snapshot state at end of day
Day -2: Snapshot state at end of day
Day -1: Snapshot state at end of day
Day 0:  (arrival) Snapshot state at end of day
...
```

When user edits Day -2 actuals:

1. Load Day -3 snapshot (last known-good state before edit)
2. Rebuild light timeline from Day -2 forward using actuals
3. Run model from snapshot state
4. Generate new schedule from resulting trajectory

### Forger99 State Vector

The Arcascope `circadian` library uses a 3-element state:

```python
state = np.array([x, xc, n])

# x:  Pacemaker activity variable (CBTmin at minimum)
# xc: Complementary oscillator variable
# n:  Photoreceptor drive (recent light history)
```

**Serialization** (verified working):

```python
# Save
state_dict = {"x": float(state[0]), "xc": float(state[1]), "n": float(state[2])}

# Restore
state = np.array([state_dict["x"], state_dict["xc"], state_dict["n"]])

# Continue simulation
trajectory = model.integrate(time, initial_condition=state, input=light)
```

---

## Recalculation Flow

### Algorithm

```python
def recalculate_schedule(schedule_id: str, edited_day: int) -> RecalculationResult:
    """
    Recalculate schedule after user records actuals.

    Args:
        schedule_id: The trip to recalculate
        edited_day: The dayOffset where actuals were recorded/changed
    """
    schedule = db.get_schedule(schedule_id)
    actuals = db.get_actuals(schedule_id)

    # 1. Find restoration point (day before earliest edit)
    #    Remember: days without actuals records are treated as compliant
    earliest_edit = min(a.dayOffset for a in actuals if a.status != "as_planned")
    restore_day = earliest_edit - 1

    # 2. Load state snapshot
    snapshot = db.get_snapshot(schedule_id, restore_day)
    if not snapshot:
        # No snapshot = need full replay from equilibrated start
        snapshot = get_equilibrated_initial_state(schedule)
        restore_day = -schedule.prepDays - 1

    initial_state = np.array([snapshot.x, snapshot.xc, snapshot.n])

    # 3. Build light timeline from restore point forward
    #    Uses actuals where recorded, planned values otherwise
    light_timeline = build_light_timeline(
        schedule=schedule,
        actuals=actuals,
        from_day=restore_day + 1
    )

    # 4. Run Forger99 from snapshot
    model = Forger99()
    time_hours = np.arange(0, len(light_timeline) * 24, 0.1)
    trajectory = model.integrate(
        time_hours,
        initial_condition=initial_state,
        input=light_timeline
    )

    # 5. Extract new CBTmin trajectory
    cbt_times = model.cbt(trajectory)

    # 6. Generate forward schedule from new circadian state
    new_schedule = generate_schedule_from_trajectory(
        schedule.inputs,
        trajectory,
        cbt_times,
        from_day=restore_day + 1
    )

    # 7. Merge: keep historical days, use new for future
    merged = merge_schedules(
        original=schedule.currentScheduleJson,
        regenerated=new_schedule,
        from_day=max(edited_day, today_day_offset(schedule))
    )

    # 8. Compute diff for user review
    diff = compute_schedule_diff(
        schedule.currentScheduleJson,
        merged
    )

    return RecalculationResult(
        new_schedule=merged,
        diff=diff,
        restored_from_day=restore_day
    )
```

### Light Timeline Construction

```python
def build_light_timeline(schedule, actuals, from_day: int) -> np.ndarray:
    """
    Build hour-by-hour light exposure array combining planned schedule with actuals.

    Default compliance assumption: if no actual recorded for an intervention,
    assume it was done as planned.

    Light values (lux):
    - Sleep: 0
    - Indoor dim: 50
    - Indoor normal: 150-300
    - Outdoor cloudy: 1000-5000
    - Outdoor bright: 10000-100000

    For model purposes, we use simplified levels:
    - 0: Sleep/dark
    - 150: Indoor/light avoidance
    - 1000: Light seeking (outdoor/light therapy)
    """
    timeline = []
    actuals_map = index_actuals_by_day(actuals)

    for day in range(from_day, schedule.last_day + 1):
        day_actuals = actuals_map.get(day, {})  # Empty = all compliant
        day_planned = get_day_planned(schedule, day)

        # Determine actual wake/sleep times (default to planned)
        wake_actual = day_actuals.get("wake")
        sleep_actual = day_actuals.get("sleep")

        wake_time = (
            wake_actual.actualTime if wake_actual and wake_actual.status == "modified"
            else day_planned.wake_target
        )
        sleep_time = (
            sleep_actual.actualTime if sleep_actual and sleep_actual.status == "modified"
            else day_planned.sleep_target
        )

        # Determine light seeking (default to done as planned)
        light_actual = day_actuals.get("light_seek")
        light_seek_done = not (light_actual and light_actual.status == "skipped")
        light_seek_time = (
            light_actual.actualTime if light_actual and light_actual.status == "modified"
            else day_planned.light_seek_start
        )

        # Build 24-hour light profile for this day
        for hour in range(24):
            if is_sleeping(hour, wake_time, sleep_time):
                timeline.append(0)
            elif light_seek_done and in_light_window(hour, light_seek_time, duration=1.0):
                timeline.append(1000)  # Bright light
            else:
                timeline.append(150)   # Indoor ambient

    return np.array(timeline)
```

### Snapshot Capture

Snapshots are captured during initial schedule generation (one per day). They represent the _planned_ trajectory assuming full compliance.

```python
def capture_snapshot(schedule_id: str, day_offset: int, trajectory, time_at_day_end: float):
    """Capture oscillator state at end of a day."""
    state = trajectory(time_at_day_end)
    cbt_hour = estimate_cbt_hour(trajectory, time_at_day_end)

    db.upsert_snapshot(
        schedule_id=schedule_id,
        day_offset=day_offset,
        x=float(state[0]),
        xc=float(state[1]),
        n=float(state[2]),
        cbt_min_hour=cbt_hour
    )
```

---

## API Endpoints

All endpoints in this section require authentication.

### Preference Editing

```
PATCH /api/trips/[id]/preferences

Request:
{
  "usesCaffeine": false,
  "usesMelatonin": true,
  "scheduleIntensity": "gentle"
}

Response:
{
  "schedule": ScheduleResponse,
  "regeneratedAt": "2026-01-10T15:30:00Z"
}
```

**Behavior**:

- Regenerates entire schedule with new preferences
- Updates `currentScheduleJson`, preserves `initialScheduleJson`
- Clears all `ModelStateSnapshot` records (new trajectory)
- Preserves `InterventionActual` records (user history)
- Triggers calendar sync if connected

### Record Actual

```
POST /api/trips/[id]/actuals

Request:
{
  "legIndex": 0,
  "dayOffset": -1,
  "interventionType": "wake",
  "actualTime": "07:15",      // null for as_planned or skipped
  "status": "modified"        // "as_planned" | "modified" | "skipped"
}

Response:
{
  "recorded": true,
  "recalculationTriggered": true,
  "recalculationId": "recalc_abc123"   // Poll for result
}
```

**Behavior**:

- Upserts `InterventionActual` record
- If intervention affects circadian model AND status is not "as_planned": triggers async recalculation
- Returns immediately (recalc may take 1-3 seconds)

Note: Recording "as_planned" explicitly is valid (user confirming compliance) but won't trigger recalculation since it matches the default assumption.

### Get Recalculation Result

```
GET /api/trips/[id]/recalculation/[recalcId]

Response:
{
  "status": "completed",      // "pending" | "completed" | "failed"
  "diff": {
    "changesCount": 4,
    "changes": [
      {
        "dayOffset": 0,
        "interventionType": "wake",
        "planned": "05:30",
        "updated": "06:15"
      },
      // ...
    ]
  },
  "newSchedule": ScheduleResponse   // Only if status=completed
}
```

### Apply Recalculation

```
POST /api/trips/[id]/recalculation/[recalcId]/apply

Response:
{
  "applied": true,
  "calendarSyncTriggered": true
}
```

**Behavior**:

- Updates `currentScheduleJson` with recalculated schedule
- Updates `lastRecalculatedAt`
- Triggers calendar sync (delete-and-replace)

### Schedule Diff

```
GET /api/trips/[id]/schedule-diff

Response:
{
  "initial": ScheduleResponse,
  "current": ScheduleResponse,
  "totalChanges": 12,
  "changesByDay": {
    "-2": ["wake: 06:00→06:30", "light_seek: 06:30-07:30→07:00-08:00"],
    "-1": ["wake: 05:30→06:00"],
    // ...
  }
}
```

---

## UI Components

### 1. Edit Preferences Modal

**Trigger**: "Edit Trip" button on trip view (authenticated users only)

**Fields** (toggles/selectors):

- Caffeine strategy: On/Off
- Melatonin: On/Off
- Schedule intensity: Gentle / Moderate / Aggressive

**Not editable**: Origin, destination, flight times. These define the trip—changing them means creating a new trip.

**On save**:

- Show loading state
- Call `PATCH /preferences`
- Refresh schedule view
- Show "Schedule updated" toast

### 2. Record Actual Sheet

**Trigger**: Tap on any intervention card (authenticated users only)

**Layout** (bottom sheet):

```
┌─────────────────────────────────┐
│  Wake at 6:00 AM                │
│  Day -1 · Prep Day 2            │
├─────────────────────────────────┤
│  ○ Done as planned              │
│  ○ Done at different time       │
│     └─ [Time Picker: 7:15 AM]   │
│  ○ Skipped                      │
├─────────────────────────────────┤
│  [Cancel]          [Save]       │
└─────────────────────────────────┘
```

**On save**:

- Call `POST /actuals`
- Update card UI to show recorded status
- If recalculation triggered: show banner

### 3. Recalculation Banner

**Trigger**: Recalculation completes with changes

**Layout** (sticky banner):

```
┌─────────────────────────────────────────────┐
│ ⟳ Your schedule has updated based on your  │
│   actual wake time.                         │
│                          [Review Changes]   │
└─────────────────────────────────────────────┘
```

**On tap**: Opens Schedule Diff Modal

### 4. Schedule Diff Modal

**Layout**:

```
┌───────────────────────────────────────────────┐
│  Schedule Changes                        [×]  │
├───────────────────────────────────────────────┤
│  Based on waking at 7:15 AM instead of        │
│  6:00 AM on Day -1, we've adjusted:           │
│                                               │
│  Day 0 (Arrival)                              │
│  • Wake target: 5:30 AM → 6:15 AM             │
│  • Light seeking: 6:00-7:00 → 6:45-7:45       │
│                                               │
│  Day 1                                        │
│  • Wake target: 5:00 AM → 5:30 AM             │
│  • Melatonin: 9:00 PM → 9:30 PM               │
│                                               │
├───────────────────────────────────────────────┤
│  [Dismiss]                   [Accept Changes] │
└───────────────────────────────────────────────┘
```

**Accept**: Applies recalculation, updates schedule view, triggers calendar sync  
**Dismiss**: Keeps current schedule (but actuals remain recorded)

### 5. Actuals Summary (Trip View)

Show compliance indicator per day (only for days with recorded actuals):

```
Day -2  ✓ Completed as planned
Day -1  ⚡ Modified (wake +1:15)
Day 0   · No deviations recorded
```

---

## Calendar Sync Integration

When schedule recalculation is applied:

1. Check if user has calendar sync enabled for this trip
2. If yes, trigger delete-and-replace sync:
   - Delete all existing events for this trip (by stored event IDs)
   - Create new events from `currentScheduleJson`
   - Store new event IDs
3. This happens automatically—no user action needed

```python
async def on_recalculation_applied(schedule_id: str):
    sync = db.get_calendar_sync(schedule_id)
    if sync and sync.enabled:
        await trigger_calendar_sync(schedule_id, strategy="delete_and_replace")
```

---

## Eight Sleep Integration (Future — Phase 5)

This section documents the planned Eight Sleep integration for architectural context. **It is not part of the initial implementation.**

### OAuth Flow

1. User clicks "Connect Eight Sleep" in settings
2. Redirect to Eight Sleep OAuth
3. On callback, store encrypted tokens in `EightSleepConnection`
4. Show "Connected" status with last sync time

### Background Sync Job

**Cron**: Every hour (Vercel cron)

```python
async def eight_sleep_sync_job():
    """Run hourly, process users whose wake time was 4+ hours ago."""

    connections = db.get_active_eight_sleep_connections()

    for conn in connections:
        active_trips = db.get_active_trips_for_user(conn.userId)

        for trip in active_trips:
            user_local_time = get_user_local_time(trip)
            planned_wake = get_todays_planned_wake(trip)

            # Only sync if 4+ hours past planned wake (data should be complete)
            if user_local_time < planned_wake + timedelta(hours=4):
                continue

            # Fetch last night's sleep from Eight Sleep API
            sleep_data = await eight_sleep_api.get_sleep_session(
                conn.accessToken,
                date=user_local_time.date() - timedelta(days=1)
            )

            if not sleep_data:
                continue

            # Create actuals (source: "eight_sleep")
            # ... record sleep and wake actuals
            # Recalculation triggers automatically if deviation detected

            conn.lastSyncAt = utcnow()
            db.save(conn)
```

### Conflict Resolution

If Eight Sleep and manual entry conflict for same intervention: most recent by `recordedAt` wins. UI shows indicator that value was overwritten.

---

## Implementation Phases

### Phase 1: Preference Editing + Schedule Storage

**Scope**:

- Add `initialScheduleJson`, `currentScheduleJson`, `lastRecalculatedAt` to schema
- Store schedules on generation (currently regenerated on every view)
- Implement `PATCH /preferences` endpoint
- Build Edit Preferences Modal UI
- Trigger calendar sync on preference change
- Gate all editing features behind authentication check

**Acceptance**:

- User can toggle caffeine off, schedule regenerates without caffeine interventions
- Initial schedule preserved, can view diff
- Calendar events update if connected
- Anonymous users cannot access edit features

### Phase 2: Actuals Recording (No Recalculation)

**Scope**:

- Add `InterventionActual` table
- Implement `POST /actuals` endpoint (recording only, no recalc yet)
- Build Record Actual Sheet UI
- Show recorded status on intervention cards
- Add actuals summary to trip view

**Acceptance**:

- User can mark interventions as done/modified/skipped
- Status persists and displays correctly
- No schedule changes yet (just recording)
- Unrecorded interventions show no status (assumed compliant)

### Phase 3: Model State Snapshots

**Scope**:

- Add `ModelStateSnapshot` table
- Modify schedule generation to capture daily snapshots
- Add snapshot retrieval API for debugging
- Build snapshot viewer (admin/debug only)

**Acceptance**:

- After generating a 7-day trip, 7+ snapshots exist
- Snapshots contain valid Forger99 state vectors
- CBTmin values in snapshots match schedule

### Phase 4: Full Recalculation

**Scope**:

- Implement recalculation algorithm (restore from snapshot, replay with actuals)
- Add recalculation endpoints (`POST /recalculation`, `GET /recalculation/[id]`, `POST /apply`)
- Build Recalculation Banner and Schedule Diff Modal
- Wire actuals recording to trigger recalculation (for non-compliant records)
- Cascade recalculation to calendar sync

**Acceptance**:

- Recording a 2-hour late wake time triggers recalculation
- Diff shows scientifically-correct adjustments
- Accepting changes updates schedule
- Calendar events update accordingly
- Recording "as_planned" does NOT trigger recalculation

### Phase 5: Eight Sleep Integration (Future)

**Scope**:

- Eight Sleep OAuth flow
- `EightSleepConnection` table
- Background sync job (Vercel cron)
- Push notifications for schedule updates
- Conflict resolution for manual vs. Eight Sleep entries

**Acceptance**:

- User connects Eight Sleep account
- After sleeping, actuals auto-populate next morning
- Schedule recalculates automatically if deviation detected

---

## Edge Cases

### Timezone Display During Transition

**Problem**: On arrival day, user's mental timezone differs from local.

**Solution**: Show both timezones on transition days:

```
Wake at 6:00 AM (Tokyo)
         2:00 PM yesterday (San Francisco)
```

### Offline Actuals Recording

**Problem**: User records actuals while offline.

**Solution**:

- Store in local state/IndexedDB
- Sync on reconnection
- Show "pending sync" indicator
- Process in order by recordedAt timestamp

### Retroactive Edits

**Problem**: User realizes they entered wrong data for Day -3, now on Day 1.

**Solution**:

- Allow editing any past day
- Recalculation uses earliest snapshot before edit
- Only future days (from today) actually change
- Past days show "actual" vs "planned" for record-keeping

### Multiple Rapid Edits

**Problem**: User records 5 actuals in quick succession.

**Solution**:

- Debounce recalculation (wait 5 seconds after last edit)
- Or: queue recalculations, only run latest
- Show "calculating..." state during debounce

### Missing Snapshots

**Problem**: Snapshot for needed day doesn't exist (data migration, bug).

**Solution**:

- Fall back to full replay from equilibrated initial state
- Log warning for monitoring
- Slower but correct

---

## Testing Strategy

### Unit Tests

1. **State serialization round-trip**: Save/restore Forger99 state, verify model continues correctly
2. **Light timeline construction**: Given actuals, verify correct light array
3. **Diff computation**: Given two schedules, verify correct change detection
4. **Default compliance**: Verify missing actuals records treated as compliant

### Integration Tests

1. **Recalculation accuracy**:
   - Generate schedule for SFO→TYO
   - Record 2-hour late wake on Day -1
   - Verify recalculated Day 0 wake target shifts appropriately
2. **Snapshot restoration**:
   - Generate schedule, capture snapshots
   - Delete Day -1 snapshot
   - Edit Day -1 actual
   - Verify falls back to Day -2 snapshot correctly

3. **Calendar sync cascade**:
   - Connect calendar, sync trip
   - Edit preference
   - Verify old events deleted, new events created

4. **Auth gating**:
   - Attempt actuals recording as anonymous user
   - Verify 401 response

### Model Validation

Compare recalculation outputs against:

1. Full replay (no snapshots) — should match exactly
2. Published PRC data — phase shifts should be physiologically plausible
3. Edge cases from literature (e.g., light at CBTmin should cause phase delay)

---

## Open Questions (Resolved)

| Question                 | Decision                                                   | Rationale                                         |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------- |
| Retroactive actuals      | Allow any past day                                         | User might realize error days later               |
| Schedule lock            | No locking                                                 | Always editable, mistakes happen                  |
| Accept/dismiss semantics | Always record actuals, acceptance controls schedule update | Recording reality ≠ accepting suboptimal schedule |
| Calendar sync trigger    | Automatic on apply                                         | User opted into sync, honor that                  |
| Snapshot granularity     | Daily (end of day)                                         | Balances storage vs. replay cost                  |
| Default assumption       | Compliance unless reported                                 | Keeps UX lightweight                              |
| Auth requirement         | All editing features                                       | Anonymous trips are ephemeral                     |

## Open Questions (Remaining)

1. **Partial day actuals**: User records wake but not sleep for a day. Recalculate with partial data?
   - _Proposal_: Yes, use planned values for unrecorded interventions (consistent with compliance assumption)

---

_Last updated: January 2026_
