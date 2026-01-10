"use client";

import { Check } from "lucide-react";
import { useSaveStatus } from "./save-status-context";

export function HeaderSaveStatus() {
  const { status } = useSaveStatus();

  if (status === "idle") {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {status === "saving" && <span className="text-slate-400">Saving...</span>}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-600">Saved</span>
        </>
      )}
    </div>
  );
}
