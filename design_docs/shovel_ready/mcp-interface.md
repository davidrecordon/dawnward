# MCP Interface - Sprint Backlog Item

## Overview

Expose 6 read-only tools via MCP (Model Context Protocol) that allow AI assistants like Claude to use Dawnward's circadian science for answering jet lag questions.

**Key Requirements:**
- JSON-RPC 2.0 compliant (MCP standard)
- Rate limited: 100 requests/hour per IP
- No authentication required
- All calculations reuse existing Python circadian module

## MCP Tools Specification

### 1. calculate_phase_shift
Calculate timezone shift and adaptation difficulty.

**Input:**
```json
{
  "origin_timezone": "America/Los_Angeles",
  "destination_timezone": "Asia/Tokyo",
  "travel_date": "2026-02-15"  // Optional, for DST handling
}
```

**Output:**
```json
{
  "shift_hours": 17,
  "direction": "advance",
  "difficulty": "hard",
  "optimal_direction": "delay",
  "optimal_shift_hours": -7,
  "explanation": "17-hour advance is equivalent to 7-hour delay. Delays are easier."
}
```

### 2. get_adaptation_plan
Generate full intervention schedule for a trip.

**Input:**
```json
{
  "origin_timezone": "America/Los_Angeles",
  "destination_timezone": "Asia/Tokyo",
  "departure_datetime": "2026-02-15T11:30",
  "arrival_datetime": "2026-02-16T15:45",
  "prep_days": 3,
  "wake_time": "07:00",
  "sleep_time": "23:00",
  "use_melatonin": true,
  "use_caffeine": true
}
```

**Output:** Full schedule response (same as `/api/schedule/generate`)

### 3. get_light_windows
Optimal light exposure/avoidance times for a specific day.

**Input:**
```json
{
  "current_cbtmin": "04:30",
  "target_cbtmin": "03:00",
  "direction": "advance"
}
```

**Output:**
```json
{
  "light_seek": {"start": "04:30", "end": "08:30", "importance": "critical"},
  "light_avoid": {"start": "00:30", "end": "04:30", "importance": "high"},
  "explanation": "Light before CBTmin delays; light after CBTmin advances."
}
```

### 4. get_melatonin_timing
When to take melatonin for phase shifting.

**Input:**
```json
{
  "current_dlmo": "21:00",
  "direction": "advance",
  "target_sleep_time": "22:00"
}
```

**Output:**
```json
{
  "optimal_time": "17:00",
  "dose_mg": 0.5,
  "window": {"earliest": "16:00", "latest": "18:00"},
  "explanation": "Take 4-5 hours before target sleep for advances."
}
```

### 5. get_caffeine_strategy
Caffeine timing for alertness without disrupting sleep.

**Input:**
```json
{
  "target_sleep_time": "23:00",
  "wake_time": "07:00",
  "needs_alertness_boost": true
}
```

**Output:**
```json
{
  "cutoff_time": "14:00",
  "boost_window": {"start": "07:00", "end": "10:00"},
  "explanation": "Caffeine half-life ~6h. Cut off 9h before sleep."
}
```

### 6. estimate_adaptation_days
How long until fully adapted.

**Input:**
```json
{
  "shift_hours": 8,
  "direction": "advance",
  "intensity": "balanced",
  "use_interventions": true
}
```

**Output:**
```json
{
  "days_with_interventions": 5,
  "days_without_interventions": 8,
  "daily_shift_rate": 1.5,
  "explanation": "With light/melatonin, expect ~1.5h/day advance."
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (~4 hours)

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

### Phase 2: Python Tool Functions (~6 hours)

**File to create:** `api/_python/mcp_tools.py`

```python
def calculate_phase_shift(origin_tz: str, dest_tz: str, travel_date: str | None) -> dict:
    # Uses: calculate_timezone_shift() from circadian_math
    pass

def get_adaptation_plan(params: dict) -> dict:
    # Uses: ScheduleGeneratorV2.generate_schedule()
    pass

def get_light_windows(current_cbtmin: str, target_cbtmin: str, direction: str) -> dict:
    # Uses: CircadianMarkerTracker + LightPRC
    pass

def get_melatonin_timing(current_dlmo: str, direction: str, target_sleep: str) -> dict:
    # Uses: CircadianMarkerTracker + MelatoninPRC
    pass

def get_caffeine_strategy(target_sleep: str, wake_time: str, needs_boost: bool) -> dict:
    # Uses: Time math from circadian_math
    pass

def estimate_adaptation_days(shift_hours: float, direction: str, intensity: str, use_interventions: bool) -> dict:
    # Uses: ShiftCalculator with intensity settings
    pass

def invoke_tool(tool_name: str, arguments: dict) -> dict:
    # Router function
    pass
```

**File to create:** `api/_python/tests/test_mcp_tools.py`

### Phase 3: API Route (~4 hours)

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
        "text": "{\"shift_hours\": 17, ...}"
      }
    ]
  }
}
```

### Phase 4: Testing & Documentation (~3 hours)

- Integration tests for all 6 tools
- Manual curl testing
- Rate limiting stress test (101 requests)
- Error case testing

**Total Estimate:** ~17 hours (2-3 days)

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

| File | Action | Description |
|------|--------|-------------|
| `src/lib/rate-limiter.ts` | Create | Rate limiting logic |
| `src/lib/ip-utils.ts` | Create | IP extraction utility |
| `src/lib/mcp/types.ts` | Create | TypeScript types |
| `src/lib/mcp/tool-definitions.ts` | Create | JSON Schema definitions |
| `src/app/api/mcp/route.ts` | Create | Main MCP endpoint |
| `api/_python/mcp_tools.py` | Create | Python tool implementations |
| `api/_python/tests/test_mcp_tools.py` | Create | Python tests |

## Verification Steps

1. `bun run typecheck` - No type errors
2. `bun run test:run` - TypeScript tests pass
3. `bun run test:python` - Python tests pass
4. Manual: `curl -X POST /api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
5. Manual: Test each of 6 tools with valid inputs
6. Manual: Test rate limiting (send 101 requests)
7. Manual: Test with Claude Desktop MCP integration

## Success Criteria

- [ ] All 6 tools callable via MCP interface
- [ ] Rate limiting enforces 100 req/hour per IP
- [ ] All tests passing (Python + TypeScript)
- [ ] MCP JSON-RPC 2.0 spec compliance
- [ ] Response time < 500ms (except get_adaptation_plan < 2.5s)
- [ ] Error messages are helpful but don't expose internals
- [ ] Works with Claude Desktop
