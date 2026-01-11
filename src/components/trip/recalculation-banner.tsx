"use client";

import { RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecalculationBannerProps {
  changesCount: number;
  onReview: () => void;
}

/**
 * Banner shown when schedule has been recalculated based on actual behavior.
 * Prompts user to review and accept the changes.
 */
export function RecalculationBanner({
  changesCount,
  onReview,
}: RecalculationBannerProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <RefreshCw className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-slate-800">Schedule Updated</p>
          <p className="text-sm text-slate-600">
            {changesCount} {changesCount === 1 ? "change" : "changes"} based on
            your actual timing
          </p>
        </div>
        <Button
          onClick={onReview}
          className="bg-amber-500 text-white hover:bg-amber-600"
        >
          Review
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
