import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  OAuthSignin: "Error starting sign-in. Please try again.",
  OAuthCallback: "Error completing sign-in. Please try again.",
  OAuthAccountNotLinked: "This email is already linked to another account.",
  default: "An unexpected error occurred. Please try again.",
};

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = errorMessages[error ?? "default"] ?? errorMessages.default;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sign-in Error
          </h1>
          <p className="mt-2 text-slate-600">{message}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/auth/signin">Try Again</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
