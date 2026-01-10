"use client";

import { cn } from "@/lib/utils";
import { GoogleIcon } from "./google-icon";

interface SignInButtonProps {
  className?: string;
}

export function SignInButton({ className }: SignInButtonProps) {
  return (
    <button
      type="submit"
      className={cn(
        "inline-flex w-full items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none",
        className
      )}
    >
      <GoogleIcon className="h-5 w-5" />
      <span>Sign in with Google</span>
    </button>
  );
}
