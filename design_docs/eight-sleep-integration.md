# Dawnward: Eight Sleep Integration Spec

## Overview

Integrate Eight Sleep Pod data to improve circadian phase estimation and enable adaptive jet lag plans that respond to actual sleep behavior.

## Key Discovery: Dual-User Handling

**Good news: We don't need to handle left/right side logic.**

Each Eight Sleep account is tied to a specific user and their side of the bed. When a user authenticates with their email/password, they get their own data automatically. The `side` property (left/right) is part of their user profile in the API response.

```
User A (left side) → logs in → gets left side data
User B (right side) → logs in → gets right side data
```

This means Dawnward treats Eight Sleep like any other single-user integration. If both partners want to use Dawnward, they each connect their own Eight Sleep account.

---

## Library Options

### Option 1: pyEight (Original)
- **Repo**: github.com/mezz64/pyEight
- **Install**: `pip install pyEight`
- **Auth**: Email/password
- **Status**: Stable, used by Home Assistant core

### Option 2: pyEight OAuth2 Fork (Recommended)
- **Repo**: github.com/lukas-clarke/pyEight  
- **Auth**: OAuth2 with client_id/client_secret
- **Status**: Actively maintained, handles Eight Sleep's newer API
- **Note**: Has built-in client credentials that work; can capture your own via MITM if needed

### Recommendation
Start with the OAuth2 fork. It's more actively maintained and handles Eight Sleep's evolving auth. Fall back to original pyEight if issues arise.

---

## Data Model

### CircadianSleepData (what we extract from Eight Sleep)

```python
@dataclass
class CircadianSleepData:
    """Circadian-relevant metrics from one night's sleep."""
    
    # Timing (most important for Forger99)
    date: date                     # Night of (e.g., Jan 3 for night of Jan 3→4)
    sleep_onset: datetime          # Actual sleep start (not bedtime)
    final_wake: datetime           # Final awakening
    
    # Duration
    total_sleep_hours: float
    time_in_bed_hours: float
    sleep_efficiency: float        # total_sleep / time_in_bed
    
    # Architecture (secondary signals)
    rem_minutes: float             # REM timing correlates with circadian phase
    deep_sleep_minutes: float      
    light_sleep_minutes: float
    awake_minutes: float
    
    # Biometrics (tertiary, but useful)
    avg_heart_rate: float | None
    avg_hrv: float | None          # HRV drops with circadian misalignment
    avg_respiratory_rate: float | None
    
    # Bed environment
    room_temp_celsius: float | None
    bed_temp_setting: int | None   # -100 to +100 scale
```

### What We Use for Circadian Modeling

| Metric | Use in Forger99 | Priority |
|--------|-----------------|----------|
| `sleep_onset` | Estimate current CBTmin (core body temp minimum) | Critical |
| `final_wake` | Validate wake phase of circadian rhythm | Critical |
| `total_sleep_hours` | Sleep pressure / recovery estimation | High |
| `rem_minutes` + timing | REM peaks near CBTmin; late REM = phase delay | Medium |
| `avg_hrv` | Low HRV suggests circadian stress/misalignment | Low |

---

## Architecture

### Background Job: Sleep Data Sync

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Cron Job (daily)                      │
│                    /api/cron/sync-eight-sleep                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Query users with Eight Sleep connected + active trip        │
│  2. For each user: fetch last 24-48h of sleep data              │
│  3. Compare to predicted sleep times in current plan            │
│  4. If deviation > threshold → trigger plan recalculation       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  handle_plan_change() │
                    └───────────────────────┘
```

### Sync Frequency

| Context | Frequency | Rationale |
|---------|-----------|-----------|
| During active trip | Every 6 hours | Catch mid-trip deviations early |
| Pre-trip (3 days before) | Daily | Establish accurate baseline |
| No active trip | Weekly | Maintain baseline data |

### Data Retention
- Keep 14 days of raw sleep sessions per user
- Keep 90 days of aggregated metrics (avg sleep onset, duration)
- Purge raw API responses after 7 days (privacy + storage)

---

## Plan Change Detection

### When to Recalculate

A plan recalculation is triggered when actual sleep deviates meaningfully from predicted:

```python
def should_recalculate_plan(
    predicted: PlanDay,
    actual: CircadianSleepData
) -> tuple[bool, str]:
    """
    Returns (should_recalculate, reason).
    """
    
    # Threshold 1: Sleep onset drift > 1.5 hours
    onset_diff = abs(actual.sleep_onset - predicted.target_bedtime)
    if onset_diff > timedelta(hours=1.5):
        return True, f"Sleep onset drifted {onset_diff} from target"
    
    # Threshold 2: Wake time drift > 1.5 hours
    wake_diff = abs(actual.final_wake - predicted.target_wake)
    if wake_diff > timedelta(hours=1.5):
        return True, f"Wake time drifted {wake_diff} from target"
    
    # Threshold 3: Severely short sleep (stress signal)
    if actual.total_sleep_hours < 4.0:
        return True, "Severely reduced sleep detected"
    
    # Threshold 4: Cumulative drift over 2+ days
    # (handled at higher level with rolling window)
    
    return False, "Within acceptable variance"
```

### What Changes in Recalculation

1. **Update estimated circadian phase** using actual sleep/wake times
2. **Re-run Forger99 model** from new phase estimate  
3. **Generate new light/melatonin/caffeine schedule**
4. **Diff against current plan** to determine what notifications to send

---

## Central Plan Change Handler

All plan modifications flow through one function that handles downstream effects:

```python
async def handle_plan_change(
    user_id: str,
    trip_id: str,
    old_plan: JetLagPlan,
    new_plan: JetLagPlan,
    change_reason: str,
    change_source: Literal["eight_sleep", "user_edit", "manual_recalc"]
) -> PlanChangeResult:
    """
    Central handler for all plan changes.
    Determines what notifications and syncs are needed.
    """
    
    # 1. Compute diff
    diff = compute_plan_diff(old_plan, new_plan)
    
    # 2. Persist new plan
    await save_plan(user_id, trip_id, new_plan)
    await save_plan_history(user_id, trip_id, old_plan, change_reason)
    
    # 3. Determine what downstream actions are needed
    actions = []
    
    if diff.has_timing_changes:
        actions.append("notify_timing_change")
        
    if diff.affects_calendar_events and user.google_calendar_connected:
        actions.append("sync_calendar")
    
    # 4. Execute downstream actions
    results = {}
    
    if "sync_calendar" in actions:
        results["calendar"] = await sync_calendar_events(user_id, trip_id, diff)
    
    if "notify_timing_change" in actions:
        if user.email_notifications_enabled:
            results["email"] = await send_plan_change_email(user, diff, change_reason)
        
        if user.push_notifications_enabled:
            results["push"] = await send_push_notification(user, diff.summary)
    
    # 5. Log for audit
    await log_plan_change(user_id, trip_id, diff, results)
    
    return PlanChangeResult(
        success=True,
        diff=diff,
        actions_taken=results
    )
```

### Plan Diff Structure

```python
@dataclass
class PlanDiff:
    """What changed between two plan versions."""
    
    # Timing shifts
    light_times_changed: list[TimingChange]
    melatonin_times_changed: list[TimingChange]
    caffeine_cutoff_changed: list[TimingChange]
    target_sleep_times_changed: list[TimingChange]
    
    # Recommendations
    added_recommendations: list[str]
    removed_recommendations: list[str]
    
    # Metadata
    days_affected: list[date]
    estimated_phase_shift: timedelta  # How much CBTmin estimate moved
    
    @property
    def has_timing_changes(self) -> bool:
        return bool(
            self.light_times_changed or 
            self.melatonin_times_changed or
            self.target_sleep_times_changed
        )
    
    @property
    def affects_calendar_events(self) -> bool:
        return self.has_timing_changes
    
    @property
    def summary(self) -> str:
        """Human-readable summary for notifications."""
        parts = []
        if self.light_times_changed:
            parts.append("light exposure times")
        if self.melatonin_times_changed:
            parts.append("melatonin timing")
        if self.target_sleep_times_changed:
            parts.append("target bedtime")
        return f"Updated: {', '.join(parts)}"
```

---

## Calendar Sync on Plan Change

```python
async def sync_calendar_events(
    user_id: str,
    trip_id: str,
    diff: PlanDiff
) -> CalendarSyncResult:
    """Update Google Calendar events to reflect plan changes."""
    
    results = []
    
    for change in diff.light_times_changed:
        existing = await find_dawnward_event(
            user_id, 
            event_type="light_exposure",
            date=change.date
        )
        
        if existing and change.new_time:
            # Update existing
            await update_calendar_event(
                event_id=existing.id,
                new_start=change.new_time,
                new_end=change.new_time + timedelta(minutes=30)
            )
            results.append(("updated", "light", change.date))
            
        elif existing and not change.new_time:
            # Removed from plan
            await delete_calendar_event(existing.id)
            results.append(("deleted", "light", change.date))
            
        elif change.new_time:
            # New event
            await create_calendar_event(
                user_id=user_id,
                title="☀️ Light exposure",
                start=change.new_time,
                duration_minutes=30,
                description="Dawnward: Bright light to shift circadian rhythm"
            )
            results.append(("created", "light", change.date))
    
    # Similar for melatonin, caffeine cutoff, etc.
    
    return CalendarSyncResult(changes=results)
```

---

## Email Notification Template

When Eight Sleep triggers a plan change:

```
Subject: Your Dawnward plan adjusted based on last night's sleep

Hi [Name],

Based on your Eight Sleep data, we've updated your jet lag plan for 
[Origin] → [Destination].

📊 What we noticed:
You fell asleep at 11:45 PM (target was 10:00 PM)

🔄 What changed:
• Light exposure: 7:00 AM → 8:30 AM
• Melatonin: 9:00 PM → 10:30 PM  
• Target bedtime: 10:00 PM → 11:00 PM

📋 Today's schedule:
☀️  8:30 AM   Bright light (30 min outside or light box)
☕  2:00 PM   Caffeine cutoff
💊 10:30 PM   Melatonin (if using)
🛏️ 11:00 PM   Target bedtime

This adjustment helps your body catch up gradually rather than 
forcing an unrealistic schedule.

[View Full Plan →]

—Dawnward
```

---

## Database Schema Additions

```sql
-- Eight Sleep connection
CREATE TABLE eight_sleep_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    email_encrypted BYTEA NOT NULL,
    password_encrypted BYTEA NOT NULL,
    
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,  -- 'success', 'auth_failed', 'api_error'
    bed_side TEXT,          -- 'left', 'right' (auto-detected)
    
    UNIQUE(user_id)
);

-- Sleep sessions
CREATE TABLE sleep_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'eight_sleep',
    
    session_date DATE NOT NULL,
    sleep_onset TIMESTAMPTZ NOT NULL,
    final_wake TIMESTAMPTZ NOT NULL,
    
    total_sleep_minutes INTEGER NOT NULL,
    rem_minutes INTEGER,
    deep_sleep_minutes INTEGER,
    light_sleep_minutes INTEGER,
    awake_minutes INTEGER,
    
    avg_heart_rate REAL,
    avg_hrv REAL,
    avg_respiratory_rate REAL,
    room_temp_celsius REAL,
    bed_temp_setting INTEGER,
    
    raw_response JSONB,  -- Auto-purge after 7 days
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, source, session_date)
);

CREATE INDEX idx_sleep_sessions_user_date 
ON sleep_sessions(user_id, session_date DESC);

-- Plan change audit log
CREATE TABLE plan_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    
    change_source TEXT NOT NULL,  -- 'eight_sleep', 'user_edit', 'manual'
    change_reason TEXT NOT NULL,
    
    old_plan JSONB NOT NULL,
    new_plan JSONB NOT NULL,
    diff_summary JSONB NOT NULL,
    
    calendar_synced BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE,
    push_sent BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plan_changes_trip 
ON plan_changes(trip_id, created_at DESC);
```

---

## API Endpoints

### Connect Eight Sleep
```
POST /api/integrations/eight-sleep/connect
Body: { email: string, password: string }
Response: { 
    success: boolean, 
    bedSide: "left" | "right",
    lastSyncDate?: string 
}
```

### Disconnect
```
DELETE /api/integrations/eight-sleep
Response: { success: boolean }
```

### Get Connection Status
```
GET /api/integrations/eight-sleep
Response: { 
    connected: boolean,
    bedSide?: string,
    lastSync?: string,
    lastSyncStatus?: string
}
```

### Manual Sync (testing/debugging)
```
POST /api/integrations/eight-sleep/sync
Response: { 
    sessionsFetched: number,
    planRecalculated: boolean,
    recalcReason?: string
}
```

### Sleep History
```
GET /api/integrations/eight-sleep/history?days=14
Response: { 
    sessions: CircadianSleepData[],
    comparisonToTarget?: ComparisonData[]  // If active trip
}
```

---

## Security Considerations

1. **Credential encryption**: Use Vercel's encrypted environment variables or integrate with a KMS
2. **Token management**: OAuth2 fork handles refresh; implement retry with backoff on auth failures
3. **Rate limiting**: Eight Sleep may throttle; queue requests and implement exponential backoff
4. **Data minimization**: Store only circadian-relevant fields; auto-purge raw responses
5. **User control**: Disconnect purges all Eight Sleep data for that user

---

## Implementation Phases

### Phase 1: Basic Connection
- [ ] Eight Sleep connect/disconnect UI
- [ ] Credential storage (encrypted)
- [ ] Initial sync on connect
- [ ] Display sleep history in settings

### Phase 2: Background Sync
- [ ] Vercel cron job for daily sync
- [ ] Sync frequency logic (trip-aware)
- [ ] Error handling and retry
- [ ] Sync status UI

### Phase 3: Adaptive Plans
- [ ] `should_recalculate_plan()` implementation
- [ ] `handle_plan_change()` central handler
- [ ] Plan diff computation
- [ ] Plan history/audit log

### Phase 4: Notifications
- [ ] Email notifications on plan change
- [ ] Push notifications (if mobile app)
- [ ] "Why did my plan change?" UI

### Phase 5: Calendar Integration
- [ ] Calendar sync on plan change
- [ ] Update existing vs. create new logic
- [ ] Handle event deletion

---

## Open Questions

1. **Credential storage**: Vercel encrypted env vars vs. external secrets manager (e.g., Doppler)?
2. **Sync on app open**: Should we also sync when user opens app (in addition to cron)?
3. **Partner data**: If one partner isn't on Dawnward, do we want to show "partner sleep patterns" as context? Probably V2.
4. **Pod temperature control**: Eight Sleep can be controlled via API. Future feature: auto-cool bed to match target bedtime?
