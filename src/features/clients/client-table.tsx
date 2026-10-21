import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Client } from "./queries";

export function ClientTable({ clients }: { clients: Client[] }) {
  const t = useTranslations();

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("clients.name")}</TableHead>
          <TableHead>{t("clients.email")}</TableHead>
          <TableHead>{t("clients.colCurrency")}</TableHead>
          <TableHead>{t("clients.colLanguage")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => (
          <TableRow key={client.id} className={client.archivedAt ? "text-muted" : undefined}>
            <TableCell>
              <Link href={`/clients/${client.id}`} className="font-medium text-fg hover:text-accent">
                {client.name}
              </Link>
              {client.archivedAt ? (
                <Badge className="ml-2 align-middle">{t("clients.archived")}</Badge>
              ) : null}
              {client.company ? <p className="text-xs text-muted">{client.company}</p> : null}
            </TableCell>
            <TableCell className="text-muted">{client.email ?? "—"}</TableCell>
            <TableCell>{client.defaultCurrency ?? "—"}</TableCell>
            <TableCell>
              {client.defaultLanguage ? t(`settings.languages.${client.defaultLanguage}`) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
