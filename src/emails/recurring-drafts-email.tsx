import { Button, Heading, Hr, Text } from "@react-email/components";
import type { Locale } from "@/i18n/config";
import { buttonStyle, EMAIL_COLORS, EmailLayout } from "./email-layout";
import { renderEmail } from "./render";
import { emailTranslator } from "./translator";

/** Rows listed in the email; the rest is summarised as "and N more". */
export const MAX_LISTED_DRAFTS = 10;

type Row = { label: string; value: string };

type Props = {
  lang: string;
  appName: string;
  preview: string;
  title: string;
  body: string;
  rows: Row[];
  more: string | null;
  button: string;
  footer: string;
  url: string;
};

export function RecurringDraftsEmail(props: Props) {
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
          {row.label}
          <span style={{ color: EMAIL_COLORS.muted }}> {row.value}</span>
        </Text>
      ))}
      {props.more ? (
        <Text style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: "20px", color: EMAIL_COLORS.muted }}>{props.more}</Text>
      ) : null}
      <div style={{ margin: "24px 0 0" }}>
        <Button href={props.url} style={buttonStyle}>
          {props.button}
        </Button>
      </div>
    </EmailLayout>
  );
}

/** "N recurring invoices are ready to send": the summary email after a recurring run created drafts. */
export async function renderRecurringDraftsEmail(input: {
  language: Locale;
  /** Every draft, newest last; only the first `MAX_LISTED_DRAFTS` are listed. */
  drafts: { number: string; clientName: string; total: string }[];
  url: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const t = emailTranslator(input.language);
  const count = input.drafts.length;
  const listed = input.drafts.slice(0, MAX_LISTED_DRAFTS);
  const { html, text } = await renderEmail(
    <RecurringDraftsEmail
      lang={input.language}
      appName="Invoice Maker"
      preview={t("recurringDrafts.preview", { count })}
      title={t("recurringDrafts.title", { count })}
      body={t("recurringDrafts.body")}
      rows={listed.map((d) => ({ label: d.clientName ? `${d.number} · ${d.clientName}` : d.number, value: d.total }))}
      more={count > listed.length ? t("recurringDrafts.more", { count: count - listed.length }) : null}
      button={t("recurringDrafts.button")}
      footer={t("footer")}
      url={input.url}
    />,
  );
  return { subject: t("recurringDrafts.subject", { count }), html, text };
}
