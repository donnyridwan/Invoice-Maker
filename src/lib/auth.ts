import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import { sendVerificationEmail } from "@/emails/send-verification";
import { ensureProfile } from "@/features/profile/queries";
import * as schema from "@/db/schema";

// Both production domains may sign in: the custom domain (BETTER_AUTH_URL, which also builds the
// links in auth emails) and the Vercel one. Better Auth trusts the base URL's origin already.
const TRUSTED_ORIGINS = ["https://invoice-maker-beta-two.vercel.app", "https://invoice.donnyridwan.my.id"];

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: TRUSTED_ORIGINS,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  // Verification is voluntary (it gates sending invoices by email, not signing in): the user asks
  // for the link from Settings, nothing is sent at sign-up.
  emailVerification: {
    sendVerificationEmail,
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
  },
  // Better Auth's built-in limiter (on in production) throttles sign-up/sign-in to a few per
  // 10s per IP; the e2e suite hammers those routes from one IP, so it can switch the limiter off.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT_DISABLED === "true" ? false : undefined },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfile(user.id, { businessName: user.name, email: user.email });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
