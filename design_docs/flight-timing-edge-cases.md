# Dawnward: Additional Edge Cases

**Status:** Product Decisions  
**Last Updated:** January 2026

---

## Overview

This document addresses four additional edge cases requiring product decisions, continuing from the initial edge cases document.

---

## 1. Ultra-Long-Haul In-Transit Interventions

**Question:** For 17-hour flights (SFO→Singapore), should we model multiple sleep opportunities? Or keep it simple with "nap when tired"?

### Research Basis

Aviation research on ultra-long-range (ULR) flights provides direct guidance:

- Flight crew on ULR operations average only **3.3 hours of actual sleep during 7-hour rest opportunities** (47% efficiency)
- Airlines operating ULR routes advise crew to **split available rest into two in-flight sleep periods**
- Sleep quality during flight is diminished compared to bedroom sleep—in-flight sleep is less restorative per hour
- The timing of rest relative to home-base circadian position strongly predicts sleep quality; "nap when tired" ignores this
- Pilots obtaining rest earlier in flight (before circadian nadir) sleep less than those with later rest periods

### The Tension

Modeling multiple sleep windows adds complexity. But "nap when tired" fails users because:
1. It doesn't account for circadian position (you may feel tired at the wrong time)
2. It doesn't help users sleep enough to function at arrival
3. It misses the opportunity to use in-flight sleep strategically for adaptation

### Decision

**Model in-flight sleep strategically for flights ≥12 hours.**

| Flight Duration | Approach |
|-----------------|----------|
| < 8 hours | Single nap opportunity, optional |
| 8-12 hours | One structured sleep window |
| 12+ hours | Two sleep windows, timed to circadian position |

### Implementation

For ultra-long-haul flights:

1. **Calculate user's circadian position** throughout the flight (CBTmin timing)
2. **Identify optimal sleep windows** that:
   - Avoid the wake maintenance zone
   - Align with periods of low circadian alertness
   - Leave user awake for landing
3. **Display as suggestions, not mandates** ("Sleep opportunity 1: 2h after departure, ~4h duration")

### UI Approach

- Show a simple flight timeline with shaded "sleep opportunity" zones
- Explain briefly: "Your body clock makes sleep easier during these windows"
- Allow users to ignore if they prefer "nap when tired"

---

## 2. Science Impact Feedback

**Question:** The plan includes science_impact in responses (e.g., "Your flight timing reduced optimal adaptation by ~15%"). Helpful or anxiety-inducing?

### Research Basis

No direct circadian research addresses this UX question, but behavioral science principles apply:

- **Actionable information** is more useful than metrics users can't change
- Flight timing is often fixed by cost, availability, or schedule—quantifying suboptimality for unchangeable decisions creates frustration
- The CDC's jet lag guidance focuses on **what to do**, not on scoring choices
- Research on health apps shows that punitive framing ("you failed by X%") reduces engagement compared to supportive framing ("here's how to optimize")

### The Tension

There's a legitimate use case: users comparing two flight options might benefit from knowing one adapts 20% faster. But post-booking, the information serves no purpose.

### Decision

**Do not show science_impact by default. Offer it only at decision points.**

| Context | Show Impact? | Framing |
|---------|--------------|---------|
| Comparing flight options (pre-booking) | Yes | "Flight A allows ~2 days faster adaptation" |
| After booking (schedule generation) | No | Just provide the optimized plan |
| User explicitly asks | Yes | "Given your flight timing, full adaptation takes ~X days" |

### Implementation

- Store science_impact internally for analytics and debugging
- Surface it only in a "Compare Flights" feature (future scope)
- Never phrase it as a loss ("reduced by 15%"); phrase as timeline ("adapts in X days")

### Exception

If the flight timing is catastrophically bad (e.g., arrival at CBTmin causing guaranteed antidromic shift), warn the user:

> "Your arrival time may make initial adjustment harder. The plan accounts for this, but the first 1-2 days may feel more challenging."

This is actionable (set expectations) rather than anxiety-inducing (you made a bad choice).

---

## 3. Multi-Leg Trips

**Question:** For NYC→London→Dubai, do we restart adaptation at each leg, "aim through" to final destination, or does it depend on layover duration?

### Research Basis

This is explicitly addressed in circadian literature:

- For **short stays (2-3 days)**, retaining home-base sleep hours during layover **reduces jet lag symptoms** during the stopover
- The circadian clock shifts 1-1.5 hours per day—meaningful adaptation requires 3+ days
- **"Antidromic re-entrainment"** (shifting the wrong direction) becomes more likely when already jet-lagged, making multi-leg calculations more complex
- Airline crew research shows layover start timing strongly predicts recovery sleep quality

### Decision Framework

**Layover duration determines strategy:**

| Layover Duration | Strategy | Rationale |
|------------------|----------|-----------|
| < 48 hours | Aim through to final destination | Insufficient time to adapt; partial shift creates compounded misalignment |
| 48-96 hours (2-4 days) | Partial adaptation to layover timezone | Some benefit from local alignment, but maintain trajectory toward final destination |
| > 96 hours (4+ days) | Restart: treat as two separate trips | Sufficient time for meaningful adaptation; user likely wants to function locally |

### Implementation

```
if layover_hours < 48:
    target = final_destination_timezone
    strategy = "aim_through"
elif layover_hours <= 96:
    target = weighted_blend(layover_tz, final_tz)
    strategy = "partial_adaptation"
else:
    leg_1_target = layover_timezone
    leg_2_target = final_destination_timezone
    strategy = "restart"
```

### Edge Cases

**Same-direction multi-leg (NYC→London→Dubai):**
- London is +5h from NYC, Dubai is +4h from London
- Both legs are eastward—can potentially "aim through" even with 3-day London layover
- Show user: "Your London layover continues your eastward shift toward Dubai"

**Opposite-direction legs (NYC→London, then London→LA):**
- Must restart at London; you can't aim through when directions conflict
- Treat as two independent trips regardless of layover duration

### UI Approach

- Ask user: "How important is feeling good in London vs. Dubai?"
- Offer toggle: "Optimize for final destination" vs. "Optimize for each stop"
- Show adaptation timeline across full itinerary

---

## 4. Partial Pre-Departure Day

**Question:** If pre-departure is only 8h (not 16h waking), should we pro-rate the shift target? Or keep fixed targets?

### Research Basis

- Pre-flight phase shifting achieves ~1 hour advance per day with morning bright light intervention
- The limiting factor is **circadian biology**, not waking hours—the clock shifts during the full 24h cycle, including sleep
- However, **intervention windows** (light exposure, melatonin timing) require the user to be awake
- An 8h pre-departure window may only contain 1-2 intervention opportunities vs. 4-5 in a full day

### The Tension

Two reasonable interpretations:
1. **Pro-rate:** With half the intervention opportunities, expect half the shift
2. **Fixed target:** The clock shifts over 24h; a partial waking day still contributes

### Decision

**Pro-rate the shift target for partial days, with a floor.**

| Available Hours | Target Phase Shift |
|-----------------|-------------------|
| 16+ hours | Full daily target (1h advance / 1.5h delay) |
| 8-16 hours | 50-100% of daily target (scaled linearly) |
| < 8 hours | Skip formal intervention; provide single reminder |

### Rationale

- If someone only has 8h before departure, cramming in aggressive interventions creates stress without proportional benefit
- Better to use limited time for one high-quality intervention than multiple rushed ones
- The partial shift still reduces post-arrival adaptation burden

### Implementation

```python
def calculate_shift_target(available_hours: float, base_target: float) -> float:
    if available_hours >= 16:
        return base_target
    elif available_hours >= 8:
        scale = available_hours / 16
        return base_target * scale
    else:
        return 0  # Skip formal pre-departure shifting
```

### UI Approach

For partial pre-departure days:
- Don't show a full schedule grid
- Show single high-impact recommendation: "Get bright light at 7am" or "Take melatonin at 9pm"
- Acknowledge the constraint: "Your departure day is short—focus on this one thing"

### Exception

If this is day 3 of a 3-day prep period and the user has been following the plan, still provide the day's interventions even if truncated. The cumulative effect matters.

---

## Summary

| Edge Case | Decision | Key Principle |
|-----------|----------|---------------|
| Ultra-long-haul in-transit | Model 2 sleep windows for flights ≥12h | Circadian position determines sleep quality |
| Science impact feedback | Hide by default; show only at decision points | Actionable > punitive |
| Multi-leg trips | Layover < 48h: aim through; > 96h: restart | Adaptation requires 3+ days to be meaningful |
| Partial pre-departure day | Pro-rate targets; < 8h gets single recommendation | One good intervention beats rushed multiples |

---

## References

- Eastman CI, Burgess HJ. (2009). How to travel the world without jet lag. *Sleep Medicine Clinics*, 4(2), 241-255.
- Gander PH et al. (2013). Circadian adaptation of airline pilots during extended duration operations. *Chronobiology International*, 30(8), 963-972.
- Lowden A, Åkerstedt T. (1998). Retaining home-base sleep hours to prevent jet lag. *Aviation, Space, and Environmental Medicine*, 69(12), 1193-1198.
- Roach GD et al. (2012). In-flight sleep of flight crew during a 7-hour rest break. *Journal of Clinical Sleep Medicine*, 8(5), 461-467.
- Waterhouse J et al. (2007). Jet lag: trends and coping strategies. *The Lancet*, 369(9567), 1117-1129.
