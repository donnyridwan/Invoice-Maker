import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailTransport, OutgoingEmail } from "./transport";

/** Where the file transport drops emails (git-ignored); the e2e helper `readOutbox` reads it. */
export const OUTBOX_DIR = path.join(process.cwd(), "var", "outbox");

/**
 * Writes each email as `var/outbox/<timestamp>-<uuid>.json` (attachments base64-encoded) instead
 * of sending it. For local development and the e2e suite.
 */
export function createFileTransport(dir: string = OUTBOX_DIR): EmailTransport {
  return {
    kind: "file",
    async send(email: OutgoingEmail) {
      const id = randomUUID();
      await mkdir(dir, { recursive: true });
      const serializable = {
        ...email,
        attachments: email.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString("base64"),
        })),
      };
      await writeFile(path.join(dir, `${Date.now()}-${id}.json`), JSON.stringify(serializable, null, 2));
      return { id };
    },
  };
}
