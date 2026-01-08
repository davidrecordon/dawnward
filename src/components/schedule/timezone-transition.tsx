import { getTimezoneAbbr } from "@/lib/intervention-utils";

interface TimezoneTransitionProps {
  fromTz: string;
  toTz: string;
  date?: Date;
}

/**
 * Visual divider showing timezone transition within a day.
 * Used when pre-departure (origin tz) and post-arrival (dest tz) phases
 * appear on the same calendar day (common for westbound flights).
 */
export function TimezoneTransition({
  fromTz,
  toTz,
  date,
}: TimezoneTransitionProps) {
  const fromAbbr = getTimezoneAbbr(fromTz, date);
  const toAbbr = getTimezoneAbbr(toTz, date);

  return (
    <div className="relative py-4">
      <div className="flex items-center gap-3">
        {/* Left line */}
        <div className="flex-1 h-px bg-slate-200" />

        {/* Timezone transition text */}
        <span className="text-xs text-slate-400 font-medium tracking-wide">
          {fromAbbr} → {toAbbr}
        </span>

        {/* Right line */}
        <div className="flex-1 h-px bg-slate-200" />
      </div>
    </div>
  );
}
