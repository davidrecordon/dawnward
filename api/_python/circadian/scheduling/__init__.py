"""
Practical Scheduling Layer.

Handles travel-aware scheduling by generating phases and planning interventions.
Calls into the science layer for optimal timing, then applies practical constraints.

Modules:
- phase_generator: Generate travel phases from flight legs
- intervention_planner: Plan interventions for each phase
- constraint_filter: Apply practical constraints (phase bounds, sleep windows)
"""

from .constraint_filter import ConstraintFilter
from .intervention_planner import InterventionPlanner
from .phase_generator import PhaseGenerator

__all__ = [
    "PhaseGenerator",
    "InterventionPlanner",
    "ConstraintFilter",
]
