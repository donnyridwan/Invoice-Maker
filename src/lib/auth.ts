import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  // Better Auth's built-in limiter (on in production) throttles sign-up/sign-in to a few per
  // 10s per IP; the e2e suite hammers those routes from one IP, so it can switch the limiter off.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT_DISABLED === "true" ? false : undefined },
  plugins: [nextCookies()],
});
