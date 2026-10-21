import { Button, Heading, Link, Text } from "@react-email/components";
import type { Locale } from "@/i18n/config";
import { buttonStyle, EMAIL_COLORS, EmailLayout } from "./email-layout";
import { renderEmail } from "./render";
import { emailTranslator } from "./translator";

type Props = {
  lang: string;
  appName: string;
  preview: string;
  title: string;
  body: string;
  button: string;
  linkHint: string;
  expires: string;
  footer: string;
  url: string;
};

export function VerifyEmail(props: Props) {
  return (
    <EmailLayout lang={props.lang} preview={props.preview} senderName={props.appName} footer={props.footer}>
      <Heading as="h1" style={{ margin: "0 0 12px", fontSize: "20px", lineHeight: "28px", color: EMAIL_COLORS.text }}>
        {props.title}
      </Heading>
      <Text style={{ margin: "0 0 24px", fontSize: "14px", lineHeight: "22px", color: EMAIL_COLORS.text }}>
        {props.body}
      </Text>
      <Button href={props.url} style={buttonStyle}>
        {props.button}
      </Button>
      <Text style={{ margin: "24px 0 4px", fontSize: "12px", lineHeight: "18px", color: EMAIL_COLORS.muted }}>
        {props.linkHint}
      </Text>
      <Link href={props.url} style={{ fontSize: "12px", lineHeight: "18px", color: EMAIL_COLORS.accent, wordBreak: "break-all" }}>
        {props.url}
      </Link>
      <Text style={{ margin: "24px 0 0", fontSize: "12px", lineHeight: "18px", color: EMAIL_COLORS.muted }}>
        {props.expires}
      </Text>
    </EmailLayout>
  );
}

/** The verification email in `locale`: subject plus HTML and text bodies. */
export async function renderVerifyEmail(input: {
  locale: Locale;
  name: string;
  url: string;
}): Promise<{ subject: string; html: string; text: string }> {
  const t = emailTranslator(input.locale);
  const { html, text } = await renderEmail(
    <VerifyEmail
      lang={input.locale}
      appName="Invoice Maker"
      preview={t("verify.preview")}
      title={t("verify.title")}
      body={t("verify.body", { name: input.name })}
      button={t("verify.button")}
      linkHint={t("verify.linkHint")}
      expires={t("verify.expires")}
      footer={t("footer")}
      url={input.url}
    />,
  );
  return { subject: t("verify.subject"), html, text };
}
