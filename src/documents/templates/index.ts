import type { ReactElement } from "react";
import type { Template } from "@/features/profile/schema";
import type { InvoiceDocument } from "../types";
import { ClassicTemplate } from "./classic";
import { MinimalTemplate } from "./minimal";
import { ModernTemplate } from "./modern";

export const TEMPLATE_COMPONENTS: Record<Template, (props: { doc: InvoiceDocument }) => ReactElement> = {
  minimal: MinimalTemplate,
  classic: ClassicTemplate,
  modern: ModernTemplate,
};
