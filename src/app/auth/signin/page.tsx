import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

/**
 * Validate callbackUrl to prevent open redirect attacks.
 * Only allows relative paths starting with "/" (not "//").
 */
function getSafeCallbackUrl(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "/";
  // Must start with "/" but not "//" (protocol-relative URL)
  if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/";
}

export default async function SignInPage({ searchParams }: Props) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl);

  // Already signed in - redirect to callback or home
  if (session) {
    redirect(safeCallbackUrl);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome to Dawnward
          </h1>
          <p className="mt-2 text-slate-600">
            Sign in to save your trips and access them from any device.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error === "OAuthAccountNotLinked"
              ? "This email is already linked to another account."
              : "An error occurred during sign in. Please try again."}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: safeCallbackUrl });
          }}
        >
          <SignInButton />
        </form>

        <p className="text-xs text-slate-500">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
