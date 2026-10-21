export type OutgoingEmail = {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Uint8Array }[];
};

export interface EmailTransport {
  kind: "resend" | "file" | "disabled";
  /** Hands the email over for delivery; rejects when it could not be accepted. */
  send(e: OutgoingEmail): Promise<{ id: string }>;
}
