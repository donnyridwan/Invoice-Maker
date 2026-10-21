import { Resend } from "resend";
import type { EmailTransport, OutgoingEmail } from "./transport";

/** Delivers through the Resend API. */
export function createResendTransport(apiKey: string): EmailTransport {
  const client = new Resend(apiKey);
  return {
    kind: "resend",
    async send(email: OutgoingEmail) {
      const { data, error } = await client.emails.send({
        from: email.from,
        to: email.to,
        cc: email.cc?.length ? email.cc : undefined,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
      });
      if (error || !data) throw new Error(error?.message ?? "Resend returned no email id");
      return { id: data.id };
    },
  };
}
