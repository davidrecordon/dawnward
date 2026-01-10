"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Check, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  tripId: string;
  formState: {
    origin: { code: string; tz: string } | null;
    destination: { code: string; tz: string } | null;
  };
  disabled?: boolean;
}

export function ShareButton({ tripId, formState, disabled }: ShareButtonProps) {
  const { data: session } = useSession();
  const [status, setStatus] = useState<"idle" | "loading" | "copied">("idle");

  async function handleShare() {
    // If not logged in, redirect to sign-in
    if (!session?.user) {
      signIn("google", { callbackUrl: window.location.href });
      return;
    }

    setStatus("loading");

    try {
      // Add share code to existing trip
      const response = await fetch(`/api/trips/${tripId}/share`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create share link");
      }

      const { url } = await response.json();

      // Build share text
      const routeText =
        formState.origin?.code && formState.destination?.code
          ? `${formState.origin.code} → ${formState.destination.code}`
          : "my trip";

      // Use Web Share API if available, otherwise copy to clipboard
      if (navigator.share) {
        await navigator.share({
          title: "My Jet Lag Schedule",
          text: `Check out my jet lag optimization schedule for ${routeText}`,
          url,
        });
        setStatus("idle");
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch (error) {
      console.error("Share error:", error);
      setStatus("idle");
    }
  }

  const isDisabled = disabled || status === "loading";

  return (
    <Button
      variant="outline"
      onClick={handleShare}
      disabled={isDisabled}
      className="flex-1 bg-white/70"
    >
      {status === "copied" ? (
        <>
          <Check className="mr-2 h-4 w-4 text-emerald-500" />
          Link Copied!
        </>
      ) : status === "loading" ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Sharing...
        </>
      ) : (
        <>
          <Share2 className="mr-2 h-4 w-4" />
          {session?.user ? "Share" : "Sign in to Share"}
        </>
      )}
    </Button>
  );
}
