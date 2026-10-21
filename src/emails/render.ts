import { render } from "@react-email/components";
import type { ReactElement } from "react";

/** The HTML and plain-text bodies of an email component. */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
