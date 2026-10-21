import { Button, Hr, Text } from "@react-email/components";
import { Fragment } from "react";
import type { Locale } from "@/i18n/config";
import { buttonStyle, EMAIL_COLORS, EmailLayout } from "./email-layout";
import { renderEmail } from "./render";
import { emailTranslator } from "./translator";

type Props = {
  lang: string;
  businessName: string;
  preview: string;
  label: string;
  total: string;
  dueOn: string;
  message: string;
  button: string;
  attachmentNote: string;
  footer: string;
  url: string;
};

/** The owner's free text: blank lines separate paragraphs, single line breaks stay line breaks. */
function MessageBody({ message }: { message: string }) {
  const paragraphs = message.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <Text
          key={index}
          style={{ margin: "0 0 12px", fontSize: "14px", lineHeight: "22px", color: EMAIL_COLORS.text }}
        >
          {paragraph.split("\n").map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </Text>
      ))}
    </>
  );
}

/** Stripe-like invoice email: business name, the total in big type, the due date, the message and one button. */
export function InvoiceEmail(props: Props) {
  return (
    <EmailLayout lang={props.lang} preview={props.preview} senderName={props.businessName} footer={props.footer}>
      <Text style={{ margin: "0 0 4px", fontSize: "12px", lineHeight: "16px", color: EMAIL_COLORS.muted }}>
        {props.label}
      </Text>
      <Text
        style={{
          margin: "0 0 4px",
          fontSize: "32px",
          lineHeight: "40px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: EMAIL_COLORS.text,
        }}
      >
        {props.total}
      </Text>
      <Text style={{ margin: "0 0 24px", fontSize: "14px", lineHeight: "20px", color: EMAIL_COLORS.muted }}>
        {props.dueOn}
      </Text>
      <Hr style={{ border: "none", borderTop: `1px solid ${EMAIL_COLORS.border}`, margin: "0 0 24px" }} />
      <MessageBody message={props.message} />
      <div style={{ margin: "24px 0 0" }}>
        <Button href={props.url} style={buttonStyle}>
          {props.button}
        </Button>
      </div>
      <Text style={{ margin: "24px 0 0", fontSize: "12px", lineHeight: "18px", color: EMAIL_COLORS.muted }}>
        {props.attachmentNote}
      </Text>
    </EmailLayout>
  );
}

/** The invoice email in the invoice's language: HTML and text bodies. */
export async function renderInvoiceEmail(input: {
  language: Locale;
  businessName: string;
  number: string;
  total: string;
  dueDate: string;
  message: string;
  url: string;
}): Promise<{ html: string; text: string }> {
  const t = emailTranslator(input.language);
  return renderEmail(
    <InvoiceEmail
      lang={input.language}
      businessName={input.businessName}
      preview={t("invoice.preview", { number: input.number, total: input.total, businessName: input.businessName })}
      label={t("invoice.label", { number: input.number })}
      total={input.total}
      dueOn={t("invoice.dueOn", { date: input.dueDate })}
      message={input.message}
      button={t("invoice.button")}
      attachmentNote={t("invoice.attachmentNote")}
      footer={t("footer")}
      url={input.url}
    />,
  );
}
