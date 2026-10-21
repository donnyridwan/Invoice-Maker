import { Button, Heading, Hr, Text } from "@react-email/components";
import type { Locale } from "@/i18n/config";
import { buttonStyle, EMAIL_COLORS, EmailLayout } from "./email-layout";
import { renderEmail } from "./render";
import { emailTranslator } from "./translator";

type Row = { label: string; value: string };

type Props = {
  lang: string;
  appName: string;
  preview: string;
  title: string;
  body: string;
  rows: Row[];
  button: string;
  footer: string;
  url: string;
};

export function ClaimNotificationEmail(props: Props) {
  return (
    <EmailLayout lang={props.lang} preview={props.preview} senderName={props.appName} footer={props.footer}>
      <Heading as="h1" style={{ margin: "0 0 12px", fontSize: "20px", lineHeight: "28px", color: EMAIL_COLORS.text }}>
        {props.title}
      </Heading>
      <Text style={{ margin: "0 0 20px", fontSize: "14px", lineHeight: "22px", color: EMAIL_COLORS.text }}>
        {props.body}
      </Text>
      <Hr style={{ border: "none", borderTop: `1px solid ${EMAIL_COLORS.border}`, margin: "0 0 16px" }} />
      {props.rows.map((row) => (
        <Text key={row.label} style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: "20px", color: EMAIL_COLORS.text }}>
          <span style={{ color: EMAIL_COLORS.muted }}>{row.label}: </span>
          {row.value}
        </Text>
      ))}
      <div style={{ margin: "24px 0 0" }}>
        <Button href={props.url} style={buttonStyle}>
          {props.button}
        </Button>
      </div>
    </EmailLayout>
  );
}

/** The "a client says they paid" email to the invoice owner. */
export async function renderClaimNotificationEmail(input: {
  language: Locale;
  number: string;
  payerName: string;
  amount: string;
  paidOn: string;
  note: string | null;
  url: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const t = emailTranslator(input.language);
  const rows: Row[] = [
    { label: t("claim.amount"), value: input.amount },
    { label: t("claim.paidOn"), value: input.paidOn },
  ];
  if (input.note) rows.push({ label: t("claim.note"), value: input.note });
  const values = { number: input.number, payer: input.payerName };
  const { html, text } = await renderEmail(
    <ClaimNotificationEmail
      lang={input.language}
      appName="Invoice Maker"
      preview={t("claim.preview", values)}
      title={t("claim.title")}
      body={t("claim.body", values)}
      rows={rows}
      button={t("claim.button")}
      footer={t("footer")}
      url={input.url}
    />,
  );
  return { subject: t("claim.subject", values), html, text };
}
