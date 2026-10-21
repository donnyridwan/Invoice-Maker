import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getInvoice } from "@/features/invoices/queries";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";

// Placeholder until the editor lands (Task 7): title and number only.
export default async function EditInvoicePage({ params }: PageProps<"/invoices/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;

  const invoice = await getInvoice(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return <PageHeader title={invoice.number} description={invoice.clientSnapshot?.name} />;
}
