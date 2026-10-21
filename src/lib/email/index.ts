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

/**
 * The transport selected by the environment, read on every call:
 * 1. `EMAIL_TRANSPORT=file` writes emails to var/outbox/;
 * 2. `RESEND_API_KEY` and `EMAIL_FROM_DOMAIN` send through Resend;
 * 3. otherwise email is disabled and `send` throws.
 */
export function getEmailTransport(): EmailTransport {
  if (process.env.EMAIL_TRANSPORT === "file") return createFileTransport();
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
    process.env.EMAIL_TRANSPORT === "file"
      ? FILE_TRANSPORT_DOMAIN
      : process.env.EMAIL_FROM_DOMAIN?.trim() || FILE_TRANSPORT_DOMAIN;
  return `"${cleanDisplayName(displayName)}" <invoice@${domain}>`;
}
