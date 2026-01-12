"""
Dawnward Circadian Schedule Generation

Uses the Arcascope circadian library (Forger99 model) to generate
personalized jet lag adaptation schedules.

Main scheduler: ScheduleGeneratorV2 (phase-based)
"""

from .recalculation import (
    InterventionActual,
    MarkerSnapshot,
    RecalculationResult,
    actuals_from_dict,
    capture_daily_snapshots,
    recalculate_from_actuals,
    snapshots_to_dict,
)
from .scheduler_v2 import ScheduleGeneratorV2, generate_schedule_v2
from .types import (
    DaySchedule,
    Intervention,
    PhaseType,
    ScheduleRequest,
    ScheduleResponse,
    # New phase types
    TravelPhase,
    TripLeg,
)

__all__ = [
    # Types
    "TripLeg",
    "ScheduleRequest",
    "Intervention",
    "DaySchedule",
    "ScheduleResponse",
    "TravelPhase",
    "PhaseType",
    # Scheduler
    "ScheduleGeneratorV2",
    "generate_schedule_v2",
    # Recalculation
    "MarkerSnapshot",
    "InterventionActual",
    "RecalculationResult",
    "capture_daily_snapshots",
    "recalculate_from_actuals",
    "snapshots_to_dict",
    "actuals_from_dict",
]
