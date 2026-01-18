/**
 * Color schemes for preference UI components.
 *
 * These are used by PreferenceToggle and PreferenceSelector
 * to maintain consistent styling across the preferences section.
 */

export type ColorScheme =
  | "emerald"
  | "orange"
  | "sky"
  | "purple"
  | "amber"
  | "violet";

export interface ColorSchemeStyles {
  bg: string;
  iconBg: string;
  iconColor: string;
  buttonActive: string;
}

export const colorSchemes: Record<ColorScheme, ColorSchemeStyles> = {
  emerald: {
    bg: "bg-emerald-50/80",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    buttonActive: "bg-emerald-500 text-white",
  },
  orange: {
    bg: "bg-orange-50/80",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    buttonActive: "bg-orange-500 text-white",
  },
  sky: {
    bg: "bg-sky-50/80",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    buttonActive: "bg-sky-500 text-white",
  },
  purple: {
    bg: "bg-purple-50/80",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    buttonActive: "bg-purple-500 text-white",
  },
  amber: {
    bg: "bg-amber-50/80",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    buttonActive: "bg-amber-500 text-white",
  },
  violet: {
    bg: "bg-violet-50/80",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    buttonActive: "bg-violet-500 text-white",
  },
};
