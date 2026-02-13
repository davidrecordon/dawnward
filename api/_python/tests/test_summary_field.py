"""
Tests for the summary field on Intervention objects.

Verifies that:
1. ALL interventions from a generated schedule have a non-empty summary
2. Key personalized data appears in summaries (duration, direction, dosage)
3. All summaries are <= 60 characters
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.scheduling.constraint_filter import ConstraintFilter
from circadian.types import (
    Intervention,
    ScheduleRequest,
    TravelPhase,
    TripLeg,
    format_duration_short,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(direction: str = "advance", **kwargs: object) -> ScheduleRequest:
    """Build a schedule request for the given direction with sensible defaults."""
    now = datetime.now()
    if direction == "advance":
        dep = now + timedelta(days=3)
        dep_str = dep.strftime("%Y-%m-%dT16:00")
        arr = dep + timedelta(hours=11)
        arr_str = arr.strftime("%Y-%m-%dT11:00")
        o_tz, d_tz = "America/Los_Angeles", "Europe/London"
    else:
        dep = now + timedelta(days=3)
        dep_str = dep.strftime("%Y-%m-%dT11:00")
        arr = dep + timedelta(hours=11)
        arr_str = arr.strftime("%Y-%m-%dT14:00")
        o_tz, d_tz = "Europe/London", "America/Los_Angeles"

    defaults: dict[str, object] = dict(
        legs=[
            TripLeg(
                origin_tz=o_tz,
                dest_tz=d_tz,
                departure_datetime=dep_str,
                arrival_datetime=arr_str,
            )
        ],
        prep_days=2,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="all_days",
        light_exposure_minutes=60,
    )
    defaults.update(kwargs)
    return ScheduleRequest(**defaults)  # type: ignore[arg-type]


def _flatten_interventions(schedule: object) -> list[object]:
    """Flatten all interventions from all day schedules."""
    items = []
    for day_schedule in schedule.interventions:  # type: ignore[attr-defined]
        items.extend(day_schedule.items)
    return items


# ---------------------------------------------------------------------------
# format_duration_short tests
# ---------------------------------------------------------------------------


class TestFormatDurationShort:
    """Test the duration formatting helper."""

    def test_none_returns_empty(self) -> None:
        assert format_duration_short(None) == ""

    def test_minutes_under_60(self) -> None:
        assert format_duration_short(30) == "30 min"
        assert format_duration_short(45) == "45 min"

    def test_exact_hours(self) -> None:
        assert format_duration_short(60) == "1h"
        assert format_duration_short(120) == "2h"
        assert format_duration_short(240) == "4h"

    def test_fractional_hours(self) -> None:
        assert format_duration_short(90) == "1.5h"
        assert format_duration_short(150) == "2.5h"


# ---------------------------------------------------------------------------
# Summary field presence
# ---------------------------------------------------------------------------


class TestSummaryPresence:
    """Every intervention must have a non-empty summary."""

    def test_advance_schedule_all_summaries_present(self) -> None:
        """All interventions in an advance (eastward) schedule have summaries."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        assert len(interventions) > 0, "Schedule should have interventions"
        for item in interventions:
            assert item.summary is not None, f"{item.type} on day has no summary"
            assert len(item.summary) > 0, f"{item.type} has empty summary"

    def test_delay_schedule_all_summaries_present(self) -> None:
        """All interventions in a delay (westward) schedule have summaries."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("delay"))
        interventions = _flatten_interventions(schedule)

        assert len(interventions) > 0, "Schedule should have interventions"
        for item in interventions:
            assert item.summary is not None, f"{item.type} on day has no summary"
            assert len(item.summary) > 0, f"{item.type} has empty summary"


# ---------------------------------------------------------------------------
# Summary content validation
# ---------------------------------------------------------------------------


class TestSummaryContent:
    """Summaries include key personalized data."""

    def test_light_seek_includes_duration(self) -> None:
        """light_seek summary mentions the configured duration number."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=90))
        interventions = _flatten_interventions(schedule)

        light_seeks = [i for i in interventions if i.type == "light_seek"]
        assert len(light_seeks) > 0, "Should have at least one light_seek"
        for ls in light_seeks:
            assert "90" in ls.summary, f"light_seek summary should include '90': {ls.summary}"

    def test_light_avoid_includes_until(self) -> None:
        """light_avoid summary includes 'until' (has an end time)."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        light_avoids = [i for i in interventions if i.type == "light_avoid"]
        if len(light_avoids) > 0:
            for la in light_avoids:
                assert "until" in la.summary.lower(), (
                    f"light_avoid summary should include 'until': {la.summary}"
                )

    def test_melatonin_includes_dosage(self) -> None:
        """melatonin summary includes '0.5mg'."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        melatonins = [i for i in interventions if i.type == "melatonin"]
        assert len(melatonins) > 0, "Should have at least one melatonin"
        for m in melatonins:
            assert "0.5mg" in m.summary, f"melatonin summary should include '0.5mg': {m.summary}"

    def test_nap_window_includes_duration(self) -> None:
        """nap_window summary includes duration info ('h' or 'min')."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", nap_preference="all_days"))
        interventions = _flatten_interventions(schedule)

        naps = [i for i in interventions if i.type == "nap_window"]
        assert len(naps) > 0, "Should have at least one nap_window"
        for n in naps:
            assert "h" in n.summary.lower() or "min" in n.summary.lower(), (
                f"nap_window summary should include duration: {n.summary}"
            )

    def test_sleep_target_advance_includes_earlier(self) -> None:
        """sleep_target summary includes 'earlier' for advance direction."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        sleeps = [i for i in interventions if i.type == "sleep_target"]
        assert len(sleeps) > 0, "Should have at least one sleep_target"
        for s in sleeps:
            assert "earlier" in s.summary.lower(), (
                f"sleep_target summary for advance should include 'earlier': {s.summary}"
            )

    def test_sleep_target_delay_includes_later(self) -> None:
        """sleep_target summary includes 'later' for delay direction."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("delay"))
        interventions = _flatten_interventions(schedule)

        sleeps = [i for i in interventions if i.type == "sleep_target"]
        assert len(sleeps) > 0, "Should have at least one sleep_target"
        for s in sleeps:
            assert "later" in s.summary.lower(), (
                f"sleep_target summary for delay should include 'later': {s.summary}"
            )

    def test_wake_target_advance_includes_light(self) -> None:
        """wake_target summary includes 'light' for advance direction."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        wakes = [i for i in interventions if i.type == "wake_target"]
        assert len(wakes) > 0, "Should have at least one wake_target"
        for w in wakes:
            assert "light" in w.summary.lower(), (
                f"wake_target summary for advance should include 'light': {w.summary}"
            )

    def test_caffeine_ok_includes_caffeine(self) -> None:
        """caffeine_ok summary includes 'caffeine'."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        caffeine_oks = [i for i in interventions if i.type == "caffeine_ok"]
        assert len(caffeine_oks) > 0, "Should have at least one caffeine_ok"
        for c in caffeine_oks:
            assert "caffeine" in c.summary.lower(), (
                f"caffeine_ok summary should include 'caffeine': {c.summary}"
            )

    def test_caffeine_cutoff_includes_caffeine(self) -> None:
        """caffeine_cutoff summary includes 'caffeine'."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        cutoffs = [i for i in interventions if i.type == "caffeine_cutoff"]
        assert len(cutoffs) > 0, "Should have at least one caffeine_cutoff"
        for c in cutoffs:
            assert "caffeine" in c.summary.lower(), (
                f"caffeine_cutoff summary should include 'caffeine': {c.summary}"
            )


# ---------------------------------------------------------------------------
# Summary length constraint
# ---------------------------------------------------------------------------


class TestSummaryLength:
    """All summaries must be <= 60 characters for collapsed card display."""

    def test_advance_summaries_under_limit(self) -> None:
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        interventions = _flatten_interventions(schedule)

        for item in interventions:
            assert item.summary is not None
            assert len(item.summary) <= 60, (
                f"{item.type} summary too long ({len(item.summary)} chars): {item.summary}"
            )

    def test_delay_summaries_under_limit(self) -> None:
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("delay"))
        interventions = _flatten_interventions(schedule)

        for item in interventions:
            assert item.summary is not None
            assert len(item.summary) <= 60, (
                f"{item.type} summary too long ({len(item.summary)} chars): {item.summary}"
            )

    def test_long_duration_summary_under_limit(self) -> None:
        """Even with max light duration (90 min), summary stays short."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=90))
        interventions = _flatten_interventions(schedule)

        for item in interventions:
            assert item.summary is not None
            assert len(item.summary) <= 60, (
                f"{item.type} summary too long ({len(item.summary)} chars): {item.summary}"
            )


# ---------------------------------------------------------------------------
# Variant coverage: direction-dependent and duration-dependent summaries
# ---------------------------------------------------------------------------


class TestSummaryVariants:
    """Test that summaries vary correctly with direction and configuration."""

    def test_wake_target_advance_says_get_light(self) -> None:
        """Advance wake_target says 'get light after'."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))
        wakes = [i for i in _flatten_interventions(schedule) if i.type == "wake_target"]
        assert len(wakes) > 0
        for w in wakes:
            assert "get light after" in w.summary.lower(), (
                f"Advance wake_target should say 'get light after': {w.summary}"
            )

    def test_wake_target_delay_says_avoid_light(self) -> None:
        """Delay wake_target says 'avoid light first'."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("delay"))
        wakes = [i for i in _flatten_interventions(schedule) if i.type == "wake_target"]
        assert len(wakes) > 0
        for w in wakes:
            assert "avoid light first" in w.summary.lower(), (
                f"Delay wake_target should say 'avoid light first': {w.summary}"
            )

    def test_wake_target_advance_and_delay_differ(self) -> None:
        """Advance and delay wake_target summaries are different."""
        gen = ScheduleGeneratorV2()
        adv = gen.generate_schedule(_make_request("advance"))
        dly = gen.generate_schedule(_make_request("delay"))
        adv_wakes = {i.summary for i in _flatten_interventions(adv) if i.type == "wake_target"}
        dly_wakes = {i.summary for i in _flatten_interventions(dly) if i.type == "wake_target"}
        assert adv_wakes != dly_wakes, "Advance and delay should produce different wake summaries"

    def test_light_seek_reflects_30_min_duration(self) -> None:
        """light_seek summary reflects 30 min configuration."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=30))
        lights = [i for i in _flatten_interventions(schedule) if i.type == "light_seek"]
        assert len(lights) > 0
        for ls in lights:
            assert "30" in ls.summary, f"Should include '30': {ls.summary}"

    def test_light_seek_reflects_60_min_duration(self) -> None:
        """light_seek summary reflects 60 min configuration."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=60))
        lights = [i for i in _flatten_interventions(schedule) if i.type == "light_seek"]
        assert len(lights) > 0
        for ls in lights:
            assert "60" in ls.summary, f"Should include '60': {ls.summary}"

    def test_light_seek_reflects_90_min_duration(self) -> None:
        """light_seek summary reflects 90 min configuration."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=90))
        lights = [i for i in _flatten_interventions(schedule) if i.type == "light_seek"]
        assert len(lights) > 0
        for ls in lights:
            assert "90" in ls.summary, f"Should include '90': {ls.summary}"

    def test_light_seek_different_durations_produce_different_summaries(self) -> None:
        """Different light durations produce different summary text."""
        gen = ScheduleGeneratorV2()
        s30 = gen.generate_schedule(_make_request("advance", light_exposure_minutes=30))
        s90 = gen.generate_schedule(_make_request("advance", light_exposure_minutes=90))
        sums_30 = {i.summary for i in _flatten_interventions(s30) if i.type == "light_seek"}
        sums_90 = {i.summary for i in _flatten_interventions(s90) if i.type == "light_seek"}
        assert sums_30 != sums_90, "30 min and 90 min should produce different light_seek summaries"

    def test_sleep_target_advance_and_delay_differ(self) -> None:
        """Advance says 'earlier', delay says 'later'."""
        gen = ScheduleGeneratorV2()
        adv = gen.generate_schedule(_make_request("advance"))
        dly = gen.generate_schedule(_make_request("delay"))
        adv_sleeps = {i.summary for i in _flatten_interventions(adv) if i.type == "sleep_target"}
        dly_sleeps = {i.summary for i in _flatten_interventions(dly) if i.type == "sleep_target"}
        assert adv_sleeps != dly_sleeps, (
            "Advance and delay should produce different sleep summaries"
        )


# ---------------------------------------------------------------------------
# Pipeline preservation: summary survives constraint filter and enrichment
# ---------------------------------------------------------------------------


class TestSummaryPipelinePreservation:
    """Verify summary field is preserved through the scheduling pipeline."""

    def test_constraint_filter_preserves_summary_on_clamp_to_start(self) -> None:
        """When constraint filter clamps light_seek to phase start, summary is preserved."""
        cf = ConstraintFilter()
        # Create a light_seek before the phase start — will be clamped
        intervention = Intervention(
            time="05:00",
            type="light_seek",
            title="Bright Light",
            description="Get bright light exposure",
            duration_min=60,
            summary="Bright light for 60 min",
        )
        phase = TravelPhase(
            phase_type="preparation",
            start_datetime=datetime(2026, 1, 20, 7, 0),
            end_datetime=datetime(2026, 1, 20, 23, 0),
            timezone="America/Los_Angeles",
            cumulative_shift=0.0,
            remaining_shift=8.0,
            day_number=-2,
        )
        result = cf.filter_phase([intervention], phase)
        assert len(result) == 1
        assert result[0].summary == "Bright light for 60 min"
        assert result[0].time == "07:00"  # Clamped to phase start

    def test_constraint_filter_preserves_summary_on_clamp_to_end(self) -> None:
        """When constraint filter clamps caffeine_cutoff to phase end, summary is preserved."""
        cf = ConstraintFilter()
        # Create a caffeine_cutoff after phase end — will be clamped
        intervention = Intervention(
            time="18:00",
            type="caffeine_cutoff",
            title="Caffeine Cutoff",
            description="Stop caffeine",
            duration_min=None,
            summary="Last caffeine \u2014 protect tonight's sleep",
        )
        phase = TravelPhase(
            phase_type="pre_departure",
            start_datetime=datetime(2026, 1, 20, 7, 0),
            end_datetime=datetime(2026, 1, 20, 15, 0),
            timezone="America/Los_Angeles",
            cumulative_shift=2.0,
            remaining_shift=6.0,
            day_number=0,
        )
        result = cf.filter_phase(
            [intervention], phase, departure_datetime=datetime(2026, 1, 20, 18, 0)
        )
        assert len(result) == 1
        assert result[0].summary == "Last caffeine \u2014 protect tonight's sleep"
        assert result[0].time == "15:00"  # Clamped to phase end

    def test_constraint_filter_preserves_summary_on_passthrough(self) -> None:
        """Interventions within bounds keep their summary unchanged."""
        cf = ConstraintFilter()
        intervention = Intervention(
            time="10:00",
            type="melatonin",
            title="Melatonin",
            description="Take melatonin",
            summary="Take 0.5mg melatonin",
        )
        phase = TravelPhase(
            phase_type="adaptation",
            start_datetime=datetime(2026, 1, 21, 7, 0),
            end_datetime=datetime(2026, 1, 21, 23, 0),
            timezone="Europe/London",
            cumulative_shift=4.0,
            remaining_shift=4.0,
            day_number=1,
        )
        result = cf.filter_phase([intervention], phase)
        assert len(result) == 1
        assert result[0].summary == "Take 0.5mg melatonin"

    def test_full_pipeline_all_summaries_survive(self) -> None:
        """End-to-end: every intervention from generate_schedule has a summary.

        This verifies that summaries generated by the planner survive through
        constraint filtering and timezone enrichment.
        """
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance"))

        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                assert item.summary is not None, (
                    f"Day {day_schedule.day} {item.type} lost summary in pipeline"
                )
                assert len(item.summary) > 0, (
                    f"Day {day_schedule.day} {item.type} has empty summary after pipeline"
                )

    def test_full_pipeline_summaries_are_personalized(self) -> None:
        """End-to-end: summaries from the full pipeline are personalized, not generic."""
        gen = ScheduleGeneratorV2()
        schedule = gen.generate_schedule(_make_request("advance", light_exposure_minutes=45))

        light_seeks = [
            i for day in schedule.interventions for i in day.items if i.type == "light_seek"
        ]
        assert len(light_seeks) > 0
        for ls in light_seeks:
            assert "45" in ls.summary, (
                f"Post-pipeline light_seek should still include configured duration '45': {ls.summary}"
            )
