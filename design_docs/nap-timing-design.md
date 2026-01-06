# Optional Nap Timing: Design Document

## Overview

This document outlines the scientific basis and algorithmic approach for calculating optimal nap windows for users with unconventional sleep schedules. The goal is to provide humanistically practical nap suggestions for schedules that may be scientifically correct but don't align with typical lifestyle patterns (e.g., wake at 1:40 AM, sleep at 5:40 PM).

---

## The Science: Two-Process Model of Sleep Regulation

Sleep timing is governed by two interacting biological processes, first described by Alexander Borbély in 1982:

### Process S: Homeostatic Sleep Pressure

- **What it is**: A "sleep debt" that accumulates the longer you're awake
- **Behavior**: Rises approximately linearly during wakefulness, declines exponentially during sleep
- **Biological marker**: Reflected in EEG slow-wave activity (SWA) during NREM sleep
- **Key insight**: The longer you've been awake, the easier it is to fall asleep and the deeper your sleep will be

### Process C: Circadian Alertness

- **What it is**: A ~24-hour internal rhythm controlled by the suprachiasmatic nucleus (SCN)
- **Behavior**: Creates peaks and troughs of alertness independent of time awake
- **Key markers**: 
  - Core body temperature minimum (Tmin): occurs ~2-3 hours before natural wake time
  - Dim light melatonin onset (DLMO): occurs ~2-3 hours before natural sleep time
- **Key insight**: There's a "wake maintenance zone" 1-3 hours before habitual bedtime where it's hard to fall asleep, even when tired

### The Interaction

Sleep propensity at any moment ≈ **Process S × Process C** (multiplicative interaction)

The optimal nap window occurs when:
1. Sleep pressure (S) is moderately elevated (enough to fall asleep easily)
2. Circadian alertness (C) is naturally dipping (not fighting against sleep)
3. Sufficient time remains to rebuild sleep pressure before main sleep

---

## The Post-Lunch Dip: A Biological Reality

### Key Finding

The "post-lunch dip" in alertness is **not caused by eating lunch**. Research shows:

- It occurs even in subjects who skip lunch
- It occurs when subjects are unaware of the time of day  
- It occurs across cultures and environments
- It's linked to a 12-hour harmonic in the circadian system (a "circasemidian" rhythm)

### Conventional Timing

For people on a standard schedule (wake ~7 AM, sleep ~11 PM):
- **Primary alertness dip**: 2:00-5:00 AM (during sleep)
- **Secondary alertness dip**: 1:00-3:00 PM (the "post-lunch dip")
- **Wake maintenance zone**: 8:00-10:00 PM (hard to nap)

### Why It Exists

When Process S (rising sleep pressure) is not sufficiently counteracted by Process C (circadian alertness), sleepiness emerges. In mid-afternoon:
- ~6-8 hours of sleep pressure have accumulated
- Circadian alertness naturally dips
- These combine to create the "nap window"

---

## Calculating Optimal Nap Timing for Any Schedule

### Core Principle

For unconventional schedules, we can't rely on clock time (e.g., "nap at 2 PM"). Instead, we calculate based on:

1. **Time since wake** (proxy for sleep pressure)
2. **Time until main sleep** (buffer needed)
3. **Position in wake period** (relative circadian timing)

### The Algorithm

```
INPUTS:
  wake_time     : DateTime  // When user wakes up
  sleep_time    : DateTime  // When user goes to sleep
  
CALCULATE:
  wake_period   = sleep_time - wake_time  // Total hours awake
  
  // Primary nap window: 30-50% into the wake period
  nap_window_start = wake_time + (wake_period × 0.30)
  nap_window_end   = wake_time + (wake_period × 0.50)
  
  // Ideal nap midpoint: ~38% into wake period
  ideal_nap_time = wake_time + (wake_period × 0.38)
  
  // Hard constraint: End nap at least 4 hours before main sleep
  latest_nap_end = sleep_time - 4 hours
  
  // Adjust window if it extends too close to bedtime
  if nap_window_end > latest_nap_end:
    nap_window_end = latest_nap_end
    
OUTPUT:
  optimal_nap_window : [nap_window_start, nap_window_end]
  suggested_nap_time : ideal_nap_time (if within window)
```

### Rationale for Percentages

| Percentage of Wake Period | Sleep Pressure | Circadian State | Nap Quality |
|---------------------------|----------------|-----------------|-------------|
| 0-20% | Low | Rising alertness | Hard to fall asleep |
| 20-30% | Building | Approaching peak | Possible but suboptimal |
| **30-50%** | **Moderate** | **Natural dip zone** | **Optimal window** |
| 50-70% | High | Recovering alertness | May enter deep sleep |
| 70-85% | Very high | Wake maintenance zone | Hard to fall asleep |
| 85-100% | Peak | Pre-sleep | Save it for main sleep |

### Example Calculations

#### Example 1: Conventional Schedule
- Wake: 7:00 AM
- Sleep: 11:00 PM  
- Wake period: 16 hours

**Calculation:**
- Nap window start: 7:00 AM + 4.8h = **11:48 AM**
- Nap window end: 7:00 AM + 8h = **3:00 PM**
- Ideal nap time: 7:00 AM + 6.1h = **1:06 PM**
- Latest nap end: 7:00 PM

**Result**: Nap between 11:48 AM - 3:00 PM, ideally around 1:00 PM ✓

(This aligns with the well-documented 1-3 PM "post-lunch dip")

#### Example 2: Early Bird Schedule
- Wake: 1:40 AM
- Sleep: 5:40 PM
- Wake period: 16 hours

**Calculation:**
- Nap window start: 1:40 AM + 4.8h = **6:28 AM**
- Nap window end: 1:40 AM + 8h = **9:40 AM**
- Ideal nap time: 1:40 AM + 6.1h = **7:46 AM**
- Latest nap end: 1:40 PM

**Result**: Nap between 6:28 AM - 9:40 AM, ideally around 7:45 AM

#### Example 3: Night Shift Worker
- Wake: 6:00 PM
- Sleep: 10:00 AM (next day)
- Wake period: 16 hours

**Calculation:**
- Nap window start: 6:00 PM + 4.8h = **10:48 PM**
- Nap window end: 6:00 PM + 8h = **2:00 AM**
- Ideal nap time: 6:00 PM + 6.1h = **12:06 AM**
- Latest nap end: 6:00 AM

**Result**: Nap between 10:48 PM - 2:00 AM, ideally around midnight

#### Example 4: Short Wake Period
- Wake: 8:00 AM
- Sleep: 4:00 PM
- Wake period: 8 hours

**Calculation:**
- Nap window start: 8:00 AM + 2.4h = **10:24 AM**
- Nap window end: 8:00 AM + 4h = **12:00 PM**
- Ideal nap time: 8:00 AM + 3h = **11:00 AM**
- Latest nap end: 12:00 PM

**Result**: Nap between 10:24 AM - 12:00 PM, ideally around 11:00 AM

---

## Nap Duration Guidelines

### Duration Options

| Duration | Sleep Stages Reached | Benefits | Risks | Best For |
|----------|---------------------|----------|-------|----------|
| **10-20 min** | Light sleep (N1-N2) | Quick alertness boost, no grogginess | Minimal benefit if very sleep deprived | Quick refresh, pre-meeting boost |
| **20-30 min** | Deep N2 | Better cognitive restoration | Slight risk of N3 entry | Standard "power nap" |
| **30-60 min** | Entering N3 (deep sleep) | Physical restoration, memory | **High risk of sleep inertia** | Avoid this range |
| **90 min** | Full sleep cycle (N1→N2→N3→REM) | Complete restoration, creativity, memory consolidation | May interfere with nighttime sleep | Recovery from significant sleep debt |

### Recommendation Logic

```
if sleep_debt < 1 hour:
  recommended_duration = 15-20 minutes
  
else if sleep_debt < 3 hours:
  recommended_duration = 20-30 minutes
  
else if time_until_main_sleep > 8 hours:
  recommended_duration = 90 minutes (full cycle)
  
else:
  recommended_duration = 20 minutes
  // Don't risk deep sleep interference
```

### Sleep Inertia Warning

If user must be alert immediately after nap:
- **Strongly recommend**: 20 minutes or less
- **Warn against**: 30-60 minute range
- **If 90 min**: Allow 30+ minutes for full awakening

---

## Special Considerations

### Circadian Phase Shifts

For users whose schedules are significantly shifted from conventional:

1. **Their circadian rhythm may not have fully adapted**
   - Body temperature minimum may still occur around 4-5 AM
   - Melatonin onset may still occur in evening hours
   
2. **Nap placement should favor:**
   - The calculated window (based on wake period)
   - But user may find sleep easier/harder at certain clock times due to residual circadian alignment

3. **Recommendation**: 
   - Start with calculated window
   - Allow user to provide feedback and adjust
   - Track which nap times result in successful sleep

### Wake Period Length Adjustments

| Wake Period | Nap Recommendation |
|-------------|-------------------|
| < 8 hours | Nap may not be necessary; if needed, keep to 10-15 min |
| 8-12 hours | Single nap of 15-20 min in middle third of wake period |
| 12-16 hours | Standard algorithm applies |
| 16-20 hours | Consider two naps: one at 30% mark, one at 60% mark |
| > 20 hours | This is extended wakefulness; strategic napping critical for safety |

### Sleep Debt Factor

If user's recent sleep has been below target:

```
sleep_debt = target_sleep - actual_sleep (rolling 3-day average)

if sleep_debt > 2 hours:
  // Shift nap window earlier (more urgent need)
  nap_window_start = wake_time + (wake_period × 0.25)
  
  // Allow longer nap duration
  max_recommended_duration = 90 minutes
  
  // But maintain end buffer
  latest_nap_end = sleep_time - 4 hours
```

### Caffeine Interaction

The "nappuccino" or "coffee nap" technique:

- **Mechanism**: Caffeine takes ~20 minutes to take effect
- **Technique**: Drink coffee, immediately take 20-minute nap, wake as caffeine kicks in
- **Best timing**: Use this at the *start* of the nap window, not the end
- **Constraint**: Only recommend if nap occurs 6+ hours before main sleep

```
if nap_time < (sleep_time - 6 hours):
  coffee_nap_eligible = true
```

---

## Data Model

### NapWindow Object

```typescript
interface NapWindow {
  // Core timing
  windowStart: DateTime;
  windowEnd: DateTime;
  suggestedTime: DateTime;
  
  // Duration recommendation  
  recommendedDuration: number;  // minutes
  maxDuration: number;          // minutes
  
  // Metadata
  wakeTime: DateTime;
  sleepTime: DateTime;
  wakePeriodHours: number;
  
  // Adjustments applied
  sleepDebtAdjusted: boolean;
  circadianConfidence: 'high' | 'medium' | 'low';
  
  // User guidance
  napType: 'power' | 'recovery' | 'full_cycle';
  coffeeNapEligible: boolean;
  sleepInertiaWarning: boolean;
}
```

### Configuration Options

```typescript
interface NapConfig {
  // Timing percentages (tune based on user feedback)
  windowStartPercent: number;   // default: 0.30
  windowEndPercent: number;     // default: 0.50
  idealTimePercent: number;     // default: 0.38
  
  // Buffers
  minBufferBeforeSleep: number; // default: 4 hours
  
  // Duration defaults
  defaultDuration: number;      // default: 20 minutes
  
  // Feature flags
  enableCoffeeNap: boolean;
  enableSleepDebtAdjustment: boolean;
}
```

---

## UI/UX Recommendations

### Display Elements

1. **Visual timeline** showing:
   - Wake time marker
   - Sleep time marker
   - Optimal nap window (highlighted zone)
   - Current time indicator
   - Suggested nap time (pin/marker)

2. **Nap card** with:
   - Suggested start time
   - Recommended duration
   - "Set alarm" quick action
   - Brief explanation ("6 hours into your 16-hour wake period")

3. **Contextual tips**:
   - If window is soon: "Your nap window opens in 45 minutes"
   - If in window: "Good time to nap if you need one"
   - If window passed: "Nap window has passed; try to make it to bedtime"
   - If near bedtime: "Too close to bedtime; save your sleep pressure"

### Copy Examples

**When nap window is optimal:**
> "Based on your schedule, the best time for a nap is between 7:30 AM and 10:00 AM. A 20-minute nap around 8:30 AM would give you the biggest boost without affecting tonight's sleep."

**When user has sleep debt:**
> "You're running a sleep deficit. If you can fit it in, a longer nap (up to 90 minutes) ending by 11:00 AM could help you recover."

**When too close to bedtime:**
> "You're in the 'wake maintenance zone' now—your body is preparing for sleep soon. Try to stay awake until your normal bedtime at 5:40 PM."

---

## Implementation Notes

### Edge Cases

1. **Very short wake periods** (< 6 hours): May not need nap; suggest only if user reports fatigue
2. **Very long wake periods** (> 18 hours): Suggest multiple nap opportunities
3. **Fragmented schedules** (polyphasic): This algorithm assumes monophasic main sleep; would need adaptation
4. **Immediately after waking**: Never suggest nap in first 2 hours (circadian alertness rising)

### Validation Rules

```typescript
function validateNapWindow(window: NapWindow): ValidationResult {
  const errors = [];
  
  // Must be after wake
  if (window.windowStart <= window.wakeTime) {
    errors.push("Nap window cannot start before wake time");
  }
  
  // Must end before sleep (with buffer)
  if (window.windowEnd > window.sleepTime - 4 * HOURS) {
    errors.push("Nap window too close to bedtime");
  }
  
  // Window must have positive duration
  if (window.windowEnd <= window.windowStart) {
    errors.push("Invalid nap window");
  }
  
  // Suggested time must be in window
  if (window.suggestedTime < window.windowStart || 
      window.suggestedTime > window.windowEnd) {
    errors.push("Suggested time outside window");
  }
  
  return { valid: errors.length === 0, errors };
}
```

### Testing Scenarios

| Scenario | Wake | Sleep | Expected Window | Expected Ideal |
|----------|------|-------|-----------------|----------------|
| Standard day | 7:00 AM | 11:00 PM | 11:48 AM - 3:00 PM | ~1:00 PM |
| Early bird | 1:40 AM | 5:40 PM | 6:28 AM - 9:40 AM | ~7:45 AM |
| Night owl | 12:00 PM | 4:00 AM | 4:48 PM - 8:00 PM | ~6:00 PM |
| Night shift | 6:00 PM | 10:00 AM | 10:48 PM - 2:00 AM | ~12:00 AM |
| Short sleeper | 5:00 AM | 9:00 PM | 9:48 AM - 1:00 PM | ~11:00 AM |
| Biphasic attempt | 6:00 AM | 2:00 PM | 8:24 AM - 10:00 AM | ~9:00 AM |

---

## References

1. Borbély, A. A. (1982). "A two process model of sleep regulation." *Human Neurobiology*, 1(3), 195-204.

2. Monk, T. H. (2005). "The post-lunch dip in performance." *Clinics in Sports Medicine*, 24(2), e15-e23.

3. Dijk, D. J., & Czeisler, C. A. (1995). "Contribution of the circadian pacemaker and the sleep homeostat to sleep propensity, sleep structure, electroencephalographic slow waves, and sleep spindle activity in humans." *Journal of Neuroscience*, 15(5), 3526-3538.

4. Lovato, N., & Lack, L. (2010). "The effects of napping on cognitive functioning." *Progress in Brain Research*, 185, 155-166.

5. Milner, C. E., & Cote, K. A. (2009). "Benefits of napping in healthy adults: impact of nap length, time of day, age, and experience with napping." *Journal of Sleep Research*, 18(2), 272-281.

6. CDC/NIOSH. "Training for Nurses on Shift Work and Long Work Hours." Module 7: Napping.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2025-01-05 | Initial design document |
