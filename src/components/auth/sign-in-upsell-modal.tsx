"use client";

import { signIn } from "next-auth/react";
import { Pencil } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignInButton } from "./sign-in-button";
import { useMediaQuery, MD_BREAKPOINT_QUERY } from "@/hooks/use-media-query";

interface SignInUpsellModalProps {
  open: boolean;
  onClose: () => void;
  callbackUrl: string;
}

/**
 * Modal that encourages logged-out users to sign in when they tap the edit icon
 * on an intervention card. Uses responsive Dialog (desktop) / Drawer (mobile).
 */
export function SignInUpsellModal({
  open,
  onClose,
  callbackUrl,
}: SignInUpsellModalProps) {
  const isDesktop = useMediaQuery(MD_BREAKPOINT_QUERY);

  const content = (
    <>
      {/* Icon */}
      <div className="flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 ring-2 ring-sky-200/50">
          <Pencil className="h-6 w-6 text-sky-600" />
        </div>
      </div>

      {/* Description */}
      <p className="text-center text-sm text-slate-600">
        Track what you actually did and see your schedule adapt. Sign in to
        record changes and access your trips from any device.
      </p>
    </>
  );

  const footer = (
    <>
      <form action={() => signIn("google", { callbackUrl })}>
        <SignInButton />
      </form>
      <Button variant="ghost" onClick={onClose} className="text-slate-500">
        Not now
      </Button>
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-sm">
          {/* Gradient accent bar */}
          <div
            className="absolute top-0 right-0 left-0 h-1 rounded-t-lg"
            style={{
              background:
                "linear-gradient(90deg, #3B9CC9 0%, #7DBB9C 50%, #E8B456 100%)",
            }}
          />
          <DialogHeader className="pt-2">
            <DialogTitle className="text-center">
              Track your schedule
            </DialogTitle>
            <DialogDescription className="sr-only">
              Sign in to record what you actually did
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">{content}</div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {footer}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        {/* Gradient accent bar */}
        <div
          className="absolute top-0 right-0 left-0 h-1 rounded-t-lg"
          style={{
            background:
              "linear-gradient(90deg, #3B9CC9 0%, #7DBB9C 50%, #E8B456 100%)",
          }}
        />
        <DrawerHeader className="pt-6">
          <DrawerTitle className="text-center">Track your schedule</DrawerTitle>
          <DrawerDescription className="sr-only">
            Sign in to record what you actually did
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
