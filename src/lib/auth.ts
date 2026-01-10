import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Get the current user or redirect to sign-in (for protected routes)
 */
export async function getRequiredUser(): Promise<{
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  return session.user;
}
