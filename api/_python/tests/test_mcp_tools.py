"""Tests for MCP tool implementations."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from mcp_tools import (
    calculate_phase_shift_py,
    classify_difficulty,
    estimate_adaptation_days,
    generate_key_advice,
    get_adaptation_plan,
    invoke_tool,
)


class TestClassifyDifficulty:
    """Tests for difficulty classification."""

    def test_small_advance_is_easy(self) -> None:
        """2-hour advance should be easy."""
        assert classify_difficulty(2, "advance") == "easy"

    def test_medium_advance_is_moderate(self) -> None:
        """4-hour advance should be moderate."""
        assert classify_difficulty(4, "advance") == "moderate"

    def test_large_advance_is_hard(self) -> None:
        """6-hour advance should be hard."""
        assert classify_difficulty(6, "advance") == "hard"

    def test_small_delay_is_easy(self) -> None:
        """3-hour delay should be easy."""
        assert classify_difficulty(3, "delay") == "easy"

    def test_medium_delay_is_moderate(self) -> None:
        """5-hour delay should be moderate."""
        assert classify_difficulty(5, "delay") == "moderate"

    def test_large_delay_is_hard(self) -> None:
        """7-hour delay should be hard."""
        assert classify_difficulty(7, "delay") == "hard"

    def test_direction_aware_thresholds(self) -> None:
        """3-hour shift has different difficulty by direction."""
        # 3-hour advance is moderate, 3-hour delay is easy
        assert classify_difficulty(3, "advance") == "moderate"
        assert classify_difficulty(3, "delay") == "easy"


class TestEstimateAdaptationDays:
    """Tests for adaptation day estimation."""

    def test_zero_shift_is_zero_days(self) -> None:
        """No timezone change means no adaptation needed."""
        assert estimate_adaptation_days(0, "advance", True) == 0
        assert estimate_adaptation_days(0, "delay", False) == 0

    def test_advance_with_interventions(self) -> None:
        """6-hour advance with interventions: 6/1.5 = 4 days."""
        assert estimate_adaptation_days(6, "advance", True) == 4

    def test_delay_with_interventions(self) -> None:
        """6-hour delay with interventions: 6/2.0 = 3 days."""
        assert estimate_adaptation_days(6, "delay", True) == 3

    def test_advance_without_interventions(self) -> None:
        """6-hour advance without interventions: 6/1.0 = 6 days."""
        assert estimate_adaptation_days(6, "advance", False) == 6

    def test_delay_without_interventions(self) -> None:
        """6-hour delay without interventions: 6/1.5 = 4 days."""
        assert estimate_adaptation_days(6, "delay", False) == 4

    def test_rounds_up(self) -> None:
        """5-hour advance with interventions: 5/1.5 = 3.33 -> 4 days."""
        assert estimate_adaptation_days(5, "advance", True) == 4


class TestGenerateKeyAdvice:
    """Tests for key advice generation."""

    def test_delay_with_all_interventions(self) -> None:
        """Delay advice includes melatonin and caffeine."""
        advice = generate_key_advice(
            direction="delay",
            shift_hours=6,
            prep_days=3,
            uses_melatonin=True,
            uses_caffeine=True,
        )
        assert "6 hours later" in advice
        assert "3 days" in advice
        assert "evening melatonin" in advice
        assert "morning light" in advice
        assert "caffeine" in advice

    def test_advance_with_all_interventions(self) -> None:
        """Advance advice includes melatonin and caffeine."""
        advice = generate_key_advice(
            direction="advance",
            shift_hours=5,
            prep_days=2,
            uses_melatonin=True,
            uses_caffeine=True,
        )
        assert "5 hours earlier" in advice
        assert "2 days" in advice
        assert "afternoon melatonin" in advice
        assert "evening light" in advice
        assert "caffeine" in advice

    def test_without_melatonin(self) -> None:
        """Advice without melatonin doesn't mention it."""
        advice = generate_key_advice(
            direction="delay",
            shift_hours=4,
            prep_days=3,
            uses_melatonin=False,
            uses_caffeine=True,
        )
        assert "melatonin" not in advice
        assert "light" in advice

    def test_without_caffeine(self) -> None:
        """Advice without caffeine doesn't mention it."""
        advice = generate_key_advice(
            direction="advance",
            shift_hours=4,
            prep_days=3,
            uses_melatonin=True,
            uses_caffeine=False,
        )
        assert "caffeine" not in advice
        assert "melatonin" in advice


class TestCalculatePhaseShiftPy:
    """Tests for the Python phase shift calculator."""

    def test_la_to_tokyo(self) -> None:
        """LA to Tokyo should be a delay (going around the world)."""
        result = calculate_phase_shift_py(
            origin_timezone="America/Los_Angeles",
            destination_timezone="Asia/Tokyo",
            travel_date="2026-01-15",
        )

        # 17-hour advance optimizes to 7-hour delay
        assert result["optimal_direction"] == "delay"
        assert result["optimal_shift_hours"] == 7
        assert result["difficulty"] == "hard"
        assert "estimated_days" in result
        assert result["estimated_days"]["with_interventions"] > 0

    def test_ny_to_london(self) -> None:
        """NY to London should be an advance."""
        result = calculate_phase_shift_py(
            origin_timezone="America/New_York",
            destination_timezone="Europe/London",
            travel_date="2026-01-15",
        )

        assert result["optimal_direction"] == "advance"
        assert result["optimal_shift_hours"] == 5
        assert result["difficulty"] == "moderate"

    def test_same_timezone(self) -> None:
        """Same timezone should have zero shift."""
        result = calculate_phase_shift_py(
            origin_timezone="America/Los_Angeles",
            destination_timezone="America/Los_Angeles",
        )

        assert result["optimal_shift_hours"] == 0
        assert result["difficulty"] == "easy"
        assert result["estimated_days"]["with_interventions"] == 0

    def test_explanation_included(self) -> None:
        """Result should include explanation."""
        result = calculate_phase_shift_py(
            origin_timezone="America/New_York",
            destination_timezone="Europe/London",
        )

        assert "explanation" in result
        assert len(result["explanation"]) > 0


class TestGetAdaptationPlan:
    """Tests for the full adaptation plan generator."""

    def test_basic_plan_structure(self) -> None:
        """Plan should have summary and days."""
        result = get_adaptation_plan(
            {
                "origin_timezone": "America/Los_Angeles",
                "destination_timezone": "Asia/Tokyo",
                "departure_datetime": "2026-02-15T11:30",
                "arrival_datetime": "2026-02-16T15:45",
            }
        )

        assert "summary" in result
        assert "days" in result
        assert isinstance(result["days"], list)
        assert len(result["days"]) > 0

    def test_summary_fields(self) -> None:
        """Summary should have all required fields."""
        result = get_adaptation_plan(
            {
                "origin_timezone": "America/Los_Angeles",
                "destination_timezone": "Asia/Tokyo",
                "departure_datetime": "2026-02-15T11:30",
                "arrival_datetime": "2026-02-16T15:45",
                "prep_days": 3,
            }
        )

        summary = result["summary"]
        assert "total_days" in summary
        assert "prep_days" in summary
        assert "post_arrival_days" in summary
        assert "shift_direction" in summary
        assert "shift_hours" in summary
        assert "key_advice" in summary

    def test_respects_prep_days(self) -> None:
        """Plan should respect requested prep days."""
        result = get_adaptation_plan(
            {
                "origin_timezone": "America/Los_Angeles",
                "destination_timezone": "Asia/Tokyo",
                "departure_datetime": "2026-02-15T11:30",
                "arrival_datetime": "2026-02-16T15:45",
                "prep_days": 5,
            }
        )

        # Should have prep days with negative day numbers
        prep_days = [d for d in result["days"] if d["day"] < 0]
        assert len(prep_days) > 0

    def test_respects_interventions(self) -> None:
        """Plan should respect intervention preferences."""
        result_with = get_adaptation_plan(
            {
                "origin_timezone": "America/New_York",
                "destination_timezone": "Europe/London",
                "departure_datetime": "2026-02-15T10:00",
                "arrival_datetime": "2026-02-15T22:00",
                "interventions": {"melatonin": True, "caffeine": True},
            }
        )

        result_without = get_adaptation_plan(
            {
                "origin_timezone": "America/New_York",
                "destination_timezone": "Europe/London",
                "departure_datetime": "2026-02-15T10:00",
                "arrival_datetime": "2026-02-15T22:00",
                "interventions": {"melatonin": False, "caffeine": False},
            }
        )

        # Both should have days, but key advice differs
        assert "melatonin" in result_with["summary"]["key_advice"]
        assert "melatonin" not in result_without["summary"]["key_advice"]

    def test_default_values(self) -> None:
        """Plan should use defaults for optional fields."""
        result = get_adaptation_plan(
            {
                "origin_timezone": "America/Los_Angeles",
                "destination_timezone": "Asia/Tokyo",
                "departure_datetime": "2026-02-15T11:30",
                "arrival_datetime": "2026-02-16T15:45",
                # No prep_days, usual_wake_time, usual_sleep_time, or interventions
            }
        )

        # Should still generate a valid plan
        assert result["summary"]["total_days"] > 0
        assert len(result["days"]) > 0


class TestInvokeTool:
    """Tests for the tool router function."""

    def test_routes_to_calculate_phase_shift(self) -> None:
        """invoke_tool should route to calculate_phase_shift."""
        result = invoke_tool(
            "calculate_phase_shift",
            {
                "origin_timezone": "America/New_York",
                "destination_timezone": "Europe/London",
            },
        )

        assert "optimal_shift_hours" in result
        assert "difficulty" in result

    def test_routes_to_get_adaptation_plan(self) -> None:
        """invoke_tool should route to get_adaptation_plan."""
        result = invoke_tool(
            "get_adaptation_plan",
            {
                "origin_timezone": "America/Los_Angeles",
                "destination_timezone": "Asia/Tokyo",
                "departure_datetime": "2026-02-15T11:30",
                "arrival_datetime": "2026-02-16T15:45",
            },
        )

        assert "summary" in result
        assert "days" in result

    def test_raises_for_unknown_tool(self) -> None:
        """invoke_tool should raise for unknown tools."""
        with pytest.raises(ValueError, match="Unknown tool"):
            invoke_tool("unknown_tool", {})
