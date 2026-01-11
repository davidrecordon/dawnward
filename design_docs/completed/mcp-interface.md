# MCP Interface - Sprint Backlog Item

## Overview

Expose 2 read-only tools via MCP (Model Context Protocol) that allow AI assistants like Claude to use Dawnward's circadian science for answering jet lag questions.

**Key Requirements:**

- JSON-RPC 2.0 compliant (MCP standard)
- Rate limited: 100 requests/hour per IP
- No authentication required
- All calculations reuse existing Python circadian module

## Design Rationale

The original spec proposed six tools. Four were cut:

| Tool                       | Why It's Gone                                           |
| -------------------------- | ------------------------------------------------------- |
| `get_light_windows`        | Requires CBTmin. User doesn't know it.                  |
| `get_melatonin_timing`     | Requires DLMO. User doesn't know it.                    |
| `get_caffeine_strategy`    | It's just "stop 9 hours before bed." Claude knows this. |
| `estimate_adaptation_days` | Now folded into `calculate_phase_shift` output.         |

Tools 3–6 required circadian markers (CBTmin, DLMO) that no traveler knows about themselves. Claude would have to call `get_adaptation_plan` first to derive those values, then call the granular tools to get information already in the plan. Pointless round-trips.

## MCP Tools Specification

### 1. calculate_phase_shift

Calculate timezone shift and adaptation difficulty. Answers "is this trip going to suck?" without requiring flight times or preferences.

**Input:**

```json
{
  "origin_timezone": "America/Los_Angeles",
  "destination_timezone": "Asia/Tokyo",
  "travel_date": "2026-02-15"
}
```

`travel_date` is optional but recommended—DST boundaries matter.

**Output:**

```json
{
  "raw_shift_hours": 17,
  "raw_direction": "advance",
  "optimal_shift_hours": 7,
  "optimal_direction": "delay",
  "difficulty": "hard",
  "estimated_days": {
    "with_interventions": 5,
    "without_interventions": 8
  },
  "explanation": "A 17-hour advance equals a 7-hour delay. Delays are physiologically easier, so the plan will shift your clock westward."
}
```

The `estimated_days` field lets Claude answer "how long will jet lag last?" directly from this lightweight call instead of generating a full plan. The estimates use typical adaptation rates (1.5 hr/day with interventions, 1 hr/day without).

### 2. get_adaptation_plan

Generate a complete, actionable schedule.

**Input:**

```json
{
  "origin_timezone": "America/Los_Angeles",
  "destination_timezone": "Asia/Tokyo",
  "departure_datetime": "2026-02-15T11:30",
  "arrival_datetime": "2026-02-16T15:45",
  "prep_days": 3,
  "usual_wake_time": "07:00",
  "usual_sleep_time": "23:00",
  "interventions": {
    "melatonin": true,
    "caffeine": true
  }
}
```

**Input notes:**

- `usual_wake_time`/`usual_sleep_time` are baseline habits in origin timezone, not targets
- `interventions` is extensible for future additions like `exercise`
- `prep_days` defaults to 3 if omitted

**Output:**

```json
{
  "summary": {
    "total_days": 8,
    "prep_days": 3,
    "post_arrival_days": 5,
    "shift_direction": "delay",
    "shift_hours": 7,
    "key_advice": "Start sleeping 1 hour later each night beginning Feb 12. Avoid bright light before 10am until adapted."
  },
  "days": [...]
}
```

The `summary.key_advice` field gives Claude a one-liner to lead with before diving into schedule details.

## Implementation Plan

### Phase 1: Core Infrastructure (~2 hours)

**Files to create:**

- `src/lib/rate-limiter.ts` - In-memory sliding window rate limiter
- `src/lib/ip-utils.ts` - IP extraction from request headers
- `src/lib/mcp/types.ts` - TypeScript types for MCP messages
- `src/lib/mcp/tool-definitions.ts` - JSON Schema for each tool

**Rate limiter design:**

```typescript
// In-memory Map with sliding window
// Key: IP address
// Value: { timestamps: number[] }
// Cleanup: Remove timestamps older than 1 hour
```

### Phase 2: Python Tool Functions (~4 hours)

**File to create:** `api/_python/mcp_tools.py`

```python
def calculate_phase_shift(origin_tz: str, dest_tz: str, travel_date: str | None) -> dict:
    # Uses: calculate_timezone_shift() from circadian_math
    # Returns: raw/optimal shift, difficulty, estimated_days
    pass

def get_adaptation_plan(params: dict) -> dict:
    # Uses: ScheduleGeneratorV2.generate_schedule()
    # Adds: summary block with key_advice
    pass

def invoke_tool(tool_name: str, arguments: dict) -> dict:
    # Router function
    pass
```

**File to create:** `api/_python/tests/test_mcp_tools.py`

### Phase 3: API Route (~2 hours)

**File to create:** `src/app/api/mcp/route.ts`

**Endpoints:**

- `POST /api/mcp` - JSON-RPC 2.0 handler

**Methods:**

- `tools/list` - Return tool definitions
- `tools/call` - Execute tool with arguments

**Request format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "calculate_phase_shift",
    "arguments": {
      "origin_timezone": "America/Los_Angeles",
      "destination_timezone": "Asia/Tokyo"
    }
  }
}
```

**Response format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"raw_shift_hours\": 17, ...}"
      }
    ]
  }
}
```

### Phase 4: Testing & Documentation (~2 hours)

- Integration tests for both tools
- Manual curl testing
- Rate limiting stress test (101 requests)
- Error case testing

**Total Estimate:** ~8-10 hours

| Metric           | Original | Revised                |
| ---------------- | -------- | ---------------------- |
| Tools            | 6        | 2                      |
| Python functions | 7        | 3 (two tools + router) |
| Test cases       | ~30      | ~12                    |
| Estimated hours  | 17       | 8–10                   |

## Open Question

Should `calculate_phase_shift` exist at all, or should `get_adaptation_plan` be the only tool?

**Argument for keeping both:** Phase shift calculation is pure math (sub-10ms). Plan generation runs a simulation (potentially 1–2 seconds). For quick "is this trip hard?" questions, the lightweight tool is noticeably snappier and doesn't require flight details.

**Argument for one tool:** Simpler mental model. Claude almost always wants to give _some_ advice, not just "yeah, that's a hard trip, good luck."

**Recommendation:** Keep both. The phase-shift tool handles the "I'm considering two different routings, which is easier?" use case cleanly without over-fetching.

## Questions to Answer

1. **Rate limiting storage:** In-memory Map (resets on deployment) or Redis (persistent)?
   - **Recommendation:** In-memory for MVP - simpler, good enough

2. **Multi-leg trip support:** Should `get_adaptation_plan` support multi-leg trips in v1?
   - **Recommendation:** Single-leg only initially for simplicity

3. **Error detail level:** How much detail in error messages?
   - **Recommendation:** Helpful but generic (e.g., "Invalid timezone" not stack traces)

4. **Response format:** Return JSON objects as strings in `content[0].text`?
   - **Recommendation:** Yes - standard MCP pattern, Claude parses naturally

## Files to Create/Modify

| File                                  | Action | Description                 |
| ------------------------------------- | ------ | --------------------------- |
| `src/lib/rate-limiter.ts`             | Create | Rate limiting logic         |
| `src/lib/ip-utils.ts`                 | Create | IP extraction utility       |
| `src/lib/mcp/types.ts`                | Create | TypeScript types            |
| `src/lib/mcp/tool-definitions.ts`     | Create | JSON Schema definitions     |
| `src/app/api/mcp/route.ts`            | Create | Main MCP endpoint           |
| `api/_python/mcp_tools.py`            | Create | Python tool implementations |
| `api/_python/tests/test_mcp_tools.py` | Create | Python tests                |

## Verification Steps

1. `bun run typecheck` - No type errors
2. `bun run test:run` - TypeScript tests pass
3. `bun run test:python` - Python tests pass
4. Manual: `curl -X POST /api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
5. Manual: Test both tools with valid inputs
6. Manual: Test rate limiting (send 101 requests)
7. Manual: Test with Claude Desktop MCP integration

## Success Criteria

- [ ] Both tools callable via MCP interface
- [ ] Rate limiting enforces 100 req/hour per IP
- [ ] All tests passing (Python + TypeScript)
- [ ] MCP JSON-RPC 2.0 spec compliance
- [ ] Response time < 500ms for calculate_phase_shift
- [ ] Response time < 2.5s for get_adaptation_plan
- [ ] Error messages are helpful but don't expose internals
- [ ] Works with Claude Desktop
