import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import { sendVerificationEmail } from "@/emails/send-verification";
import { ensureProfile } from "@/features/profile/queries";
import * as schema from "@/db/schema";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
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
