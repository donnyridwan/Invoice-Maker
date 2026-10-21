import { createFileTransport } from "./file";
import { createResendTransport } from "./resend";
import type { EmailTransport } from "./transport";

export type { EmailTransport, OutgoingEmail } from "./transport";

const FILE_TRANSPORT_DOMAIN = "example.test";

const disabledTransport: EmailTransport = {
  kind: "disabled",
  async send() {
    throw new Error("Email delivery is not configured (set RESEND_API_KEY and EMAIL_FROM_DOMAIN)");
  },
};

let warnedAboutFileTransport = false;

/**
 * Whether `EMAIL_TRANSPORT=file` is in effect. It writes emails (verification tokens included) to
 * disk in clear text, so it is for development and the e2e suite only: it is refused (and warned
 * about, once) on Vercel production and on any production build. The e2e server is a production
 * build, so it opts in with `ALLOW_FILE_EMAIL_TRANSPORT=true`, which never works on Vercel production.
 */
function fileTransportEnabled(): boolean {
  if (process.env.EMAIL_TRANSPORT !== "file") return false;
  const onVercelProduction = process.env.VERCEL_ENV === "production";
  const productionBuild = process.env.NODE_ENV === "production";
  if (!onVercelProduction && (!productionBuild || process.env.ALLOW_FILE_EMAIL_TRANSPORT === "true")) return true;
  if (!warnedAboutFileTransport) {
    warnedAboutFileTransport = true;
    console.warn("EMAIL_TRANSPORT=file is ignored in production; email delivery is treated as not configured.");
  }
  return false;
}

/**
 * The transport selected by the environment, read on every call:
 * 1. `EMAIL_TRANSPORT=file` writes emails to var/outbox/ (never in production, see `fileTransportEnabled`);
 * 2. `RESEND_API_KEY` and `EMAIL_FROM_DOMAIN` send through Resend;
 * 3. otherwise email is disabled and `send` throws.
 */
export function getEmailTransport(): EmailTransport {
  if (fileTransportEnabled()) return createFileTransport();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey && process.env.EMAIL_FROM_DOMAIN?.trim()) return createResendTransport(apiKey);
  return disabledTransport;
}

export function isEmailEnabled(): boolean {
  return getEmailTransport().kind !== "disabled";
}

/** Display name for a From header: no quotes, angle brackets, backslashes or line breaks. */
function cleanDisplayName(name: string): string {
  const cleaned = name.replace(/["<>\\\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned || "Invoice";
}

/**
 * `"<name>" <invoice@domain>`: the sender of invoice emails. The domain is `EMAIL_FROM_DOMAIN`
 * (`example.test` for the file transport).
 */
export function fromAddress(displayName: string): string {
  const domain =
    fileTransportEnabled()
      ? FILE_TRANSPORT_DOMAIN
      : process.env.EMAIL_FROM_DOMAIN?.trim() || FILE_TRANSPORT_DOMAIN;
  return `"${cleanDisplayName(displayName)}" <invoice@${domain}>`;
}
