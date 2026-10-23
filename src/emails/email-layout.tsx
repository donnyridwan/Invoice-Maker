import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

// Colours follow the app's neutral theme: near-black ink and buttons on white and light grey.
export const EMAIL_COLORS = {
  accent: "#0A0A0A",
  border: "#EBEBEB",
  text: "#0A0A0A",
  muted: "#6B6B6B",
  subtle: "#F5F5F5",
} as const;

export const EMAIL_FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Primary button style shared by every email: one accent button per message. */
export const buttonStyle = {
  display: "inline-block",
  backgroundColor: EMAIL_COLORS.accent,
  color: "#FFFFFF",
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "20px",
  textDecoration: "none",
  padding: "10px 18px",
  borderRadius: "8px",
} as const;

/**
 * The shared frame of every email: a light grey page, one white card with the sender's name on
 * top, the content, and a small footer under the card.
 */
export function EmailLayout({
  lang,
  preview,
  senderName,
  footer,
  children,
}: {
  lang: string;
  preview: string;
  senderName: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: EMAIL_COLORS.subtle, margin: 0, padding: "32px 12px", fontFamily: EMAIL_FONT }}>
        <Container
          style={{
            maxWidth: "480px",
            backgroundColor: "#FFFFFF",
            border: `1px solid ${EMAIL_COLORS.border}`,
            borderRadius: "12px",
            padding: "32px",
          }}
        >
          <Text
            style={{ margin: "0 0 24px", fontSize: "14px", fontWeight: 600, color: EMAIL_COLORS.text, lineHeight: "20px" }}
          >
            {senderName}
          </Text>
          <Section>{children}</Section>
        </Container>
        <Text
          style={{
            maxWidth: "480px",
            margin: "16px auto 0",
            textAlign: "center",
            fontSize: "12px",
            lineHeight: "16px",
            color: EMAIL_COLORS.muted,
          }}
        >
          {footer}
        </Text>
      </Body>
    </Html>
  );
}
