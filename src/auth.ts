import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

/**
 * Full NextAuth configuration with Prisma adapter.
 * Use this for server-side auth operations (not Edge).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  events: {
    /**
     * Update Account record when user signs in with new/updated tokens.
     * This handles incremental authorization (e.g., adding calendar scope)
     * where the PrismaAdapter might not update the existing account.
     */
    async signIn({ account, user }) {
      if (!account || !user?.id || account.provider !== "google") {
        return;
      }

      try {
        // Find existing account
        const existingAccount = await prisma.account.findFirst({
          where: {
            userId: user.id,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        });

        if (existingAccount) {
          // Update existing account with new tokens and scope
          await prisma.account.update({
            where: { id: existingAccount.id },
            data: {
              access_token: account.access_token,
              refresh_token:
                account.refresh_token ?? existingAccount.refresh_token,
              expires_at: account.expires_at,
              scope: account.scope,
              token_type: account.token_type,
              id_token: account.id_token,
            },
          });
          console.log(
            `[Auth] Updated Account for user ${user.id} with scope: ${account.scope}`
          );
        }
      } catch (error) {
        // Log but don't fail sign-in if account update fails
        console.error("[Auth] Failed to update Account on sign-in:", error);
      }
    },
  },
});
