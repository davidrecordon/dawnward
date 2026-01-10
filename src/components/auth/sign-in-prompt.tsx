"use client";

import { signIn } from "next-auth/react";
import { SignInButton } from "./sign-in-button";

interface SignInPromptProps {
  callbackUrl?: string;
}

export function SignInPrompt({ callbackUrl = "/" }: SignInPromptProps) {
  return (
    <div className="rounded-xl border border-sky-200/50 bg-gradient-to-r from-sky-50 to-amber-50 p-6">
      <h3 className="font-semibold text-slate-900">Save your plan</h3>
      <p className="mt-1 text-sm text-slate-600">
        Sign in to save this trip and access it from any device.
      </p>
      <form action={() => signIn("google", { callbackUrl })} className="mt-4">
        <SignInButton />
      </form>
    </div>
  );
}
