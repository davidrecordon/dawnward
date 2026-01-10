"use client";

import type { WakeTargetGroup } from "@/types/schedule";
import { InterventionCard } from "./intervention-card";

interface WakeTargetCardProps {
  group: WakeTargetGroup;
  /** Optional timezone to display on the parent card */
  timezone?: string;
}

/**
 * Renders a wake_target with its nested children.
 * Creates a "wake up and do these things" visual hierarchy.
 */
export function WakeTargetCard({ group, timezone }: WakeTargetCardProps) {
  return (
    <div className="relative">
      {/* Parent card: wake_target */}
      <InterventionCard intervention={group.wakeTarget} timezone={timezone} />

      {/* Children container with connecting line */}
      {group.children.length > 0 && (
        <div className="relative mt-2 ml-6">
          {/* Vertical connecting line - amber to match timeline gradient */}
          <div className="absolute top-0 bottom-3 left-4 w-0.5 rounded-full bg-amber-200" />

          {/* Child cards */}
          <div className="space-y-2">
            {group.children.map((child, index) => (
              <div
                key={`${child.type}-${child.time}-${index}`}
                className="relative"
              >
                {/* Horizontal connector to child - amber to match timeline gradient */}
                <div className="absolute top-1/2 left-4 h-0.5 w-4 -translate-y-1/2 bg-amber-200" />

                {/* Child card with left padding for connector */}
                <div className="pl-8">
                  <InterventionCard intervention={child} variant="nested" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
