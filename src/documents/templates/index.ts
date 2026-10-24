import type { ReactElement } from "react";
import type { Template } from "@/features/profile/schema";
import type { InvoiceDocument } from "../types";
import { CardTemplate } from "./card";
import { HighlightTemplate } from "./highlight";
import { LineTemplate } from "./line";

export const TEMPLATE_COMPONENTS: Record<Template, (props: { doc: InvoiceDocument }) => ReactElement> = {
  highlight: HighlightTemplate,
  line: LineTemplate,
  card: CardTemplate,
};
