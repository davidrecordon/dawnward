# Dawnward: Sleep & Nap Edge Cases

**Status:** Product Decisions  
**Last Updated:** January 2026

---

## Overview

This document addresses three edge cases requiring product decisions, grounded in the circadian and sleep research documented in the Science Methodology file.

---

## 1. Pre-Departure Naps

**Question:** Should we recommend a nap 2-4 hours before a late-night departure?

### Research Basis

- The **wake maintenance zone** (1-3 hours before habitual bedtime) actively suppresses sleep—the body fights against napping during this window
- Sleep propensity follows a multiplicative relationship: even with moderate sleep pressure, high circadian alertness prevents sleep onset
- A pre-departure nap **reduces sleep pressure** needed to fall asleep on the flight
- The 4-hour minimum buffer before main sleep exists specifically to allow sleep pressure to rebuild

### Decision

**Do not recommend pre-departure naps by default.**

Users attempting to nap 2-4 hours before a late flight face two problems: they're unlikely to fall asleep (wake maintenance zone), and if they do, they'll have difficulty sleeping on the plane.

### Exception

For ultra-long-haul flights (12+ hours) where in-flight sleep will be fragmented regardless, an *early* nap (6+ hours before departure) could bank rest. This is rare enough to handle as an advanced option rather than default behavior.

---

## 2. Arrival-Day Fatigue (Red-Eye Recovery)

**Question:** How should we handle arrival-day fatigue from red-eye flights?

### Research Basis

- Red-eye passengers typically arrive with 2-5+ hours of sleep debt
- Sleep-debt-adjusted nap windows shift earlier (to 25% of wake period) with longer permitted duration (up to 90 minutes)
- Arrival day is physiologically unique: the user is awake during their biological night while local time indicates morning
- Aggressive napping will derail circadian adjustment; no napping risks safety and function issues

### Decision

**Offer a structured "arrival recovery nap" with conservative guardrails.**

| Parameter | Standard Nap | Arrival Day Recovery |
|-----------|--------------|---------------------|
| Window start | 30% into wake period | As soon as practical post-arrival |
| Window end | 50% into wake period | No later than 1pm local |
| Max duration | 20-30 min | 90 min (one full cycle) |
| Buffer before target sleep | 4 hours | 6-8 hours (more conservative) |

### UI Approach

- Flag arrival day specially in the schedule view
- Offer clear options: "Power through" vs "Recovery nap"
- If user chooses nap, display hard cutoff time
- Messaging: "You'll be tired—this nap helps you function while your body adjusts"

### Late Arrivals

For arrivals after ~4pm local, recommend pushing through to target bedtime rather than napping. A nap ending at 6:30pm leaves insufficient time to rebuild sleep pressure for nighttime sleep.

---

## 3. Sleep vs. Nap Classification

**Question:** What's the minimum useful sleep window? Is 4 hours a "nap" or "sleep"?

### Research Basis

- A full sleep cycle is approximately 90 minutes
- Sleep architecture progresses through cycles: early cycles are NREM-heavy (physical restoration), later cycles are REM-heavy (cognitive restoration, memory consolidation)
- Duration categories by purpose:
  - 10-20 min: Alertness boost, minimal sleep inertia
  - 30-60 min: Danger zone—likely deep sleep entry, groggy waking
  - 90 min: Full cycle, good for recovery
- 4 hours encompasses 2.5-3 complete cycles—sufficient for basic restoration but leaves accumulated deficit

### Decision

**Use a three-tier classification with 4 hours as the nap/sleep threshold.**

| Duration | Category | Sleep Pressure Reset | UI Label |
|----------|----------|---------------------|----------|
| < 90 min | Nap | Minimal | "Nap" |
| 90 min – 4h | Short sleep | Partial (~50%) | "Rest period" |
| 4h+ | Sleep | Meaningful (with deficit) | "Sleep" |

### Implementation Notes

- When calculating next-day sleep pressure, discount short sleep periods (don't assume full reset)
- If the schedule produces a < 4h sleep window, flag as potentially problematic
- Consider whether sub-4h windows indicate the schedule needs adjustment (gentler daily shift, more preparation days)

---

## Summary

| Edge Case | Default Behavior | Rationale |
|-----------|------------------|-----------|
| Pre-departure nap (2-4h before flight) | **No** | Wake maintenance zone + reduces in-flight sleep pressure |
| Arrival-day fatigue | **Recovery nap with guardrails** | Balance function vs. circadian adjustment |
| Sleep classification threshold | **4 hours** | Aligns with sleep architecture (2.5-3 cycles minimum) |

---

## References

- Borbély AA. (1982). A two process model of sleep regulation. *Human Neurobiology*, 1(3), 195-204.
- Lovato N, Lack L. (2010). The effects of napping on cognitive functioning. *Progress in Brain Research*, 185, 155-166.
- Milner CE, Cote KA. (2009). Benefits of napping in healthy adults. *Journal of Sleep Research*, 18(2), 272-281.
- Strogatz SH, Kronauer RE, Czeisler CA. (1987). Circadian pacemaker interferes with sleep onset at specific times each day. *American Journal of Physiology*, 253(1), R172-R178.
