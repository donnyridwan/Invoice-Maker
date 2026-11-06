"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { settleAction, type ActionResult } from "@/lib/action-result";
import { useServerForm } from "@/lib/use-server-form";
import { actionErrorMessage } from "@/lib/validation-message";
import { addMemberAction, deleteWorkspaceAction, removeMemberAction, setMemberRoleAction } from "./actions";
import type { WorkspaceMember } from "./queries";

function AddMemberForm() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { pending, formError, errorFor, submit } = useServerForm(addMemberAction);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!(await submit({ email }))) return;
    toast.success(t("team.added", { email: email.trim() }));
    setEmail("");
    router.refresh();
  }

  const error = errorFor("email") ?? errorFor("_form");
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <FormField
        label={t("team.email")}
        htmlFor="member-email"
        error={error}
        hint={t("team.emailHint")}
        className="flex-1"
      >
        <Input
          id="member-email"
          type="email"
          autoComplete="off"
          value={email}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="sm:mt-6">
        {t("team.add")}
      </Button>
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
    </form>
  );
}

function MemberActions({ member, isSelf }: { member: WorkspaceMember; isSelf: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await settleAction(action);
      if (!result.ok) {
        toast.error(actionErrorMessage(t, result));
        return;
      }
      toast.success(success);
      setConfirming(false);
      if (after) after();
      else router.refresh();
    });
  }

  const nextRole = member.role === "owner" ? "member" : "owner";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("team.actionsFor", { name: member.name })}
            disabled={pending}
            className="px-2"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => run(() => setMemberRoleAction(member.userId, nextRole), t("team.roleChanged"))}
          >
            {nextRole === "owner" ? t("team.makeOwner") : t("team.makeMember")}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
            {isSelf ? t("team.leave") : t("team.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSelf ? t("team.leaveTitle") : t("team.removeTitle", { name: member.name })}</DialogTitle>
            <DialogDescription>{isSelf ? t("team.leaveDescription") : t("team.removeDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => removeMemberAction(member.userId),
                  isSelf ? t("team.left") : t("team.removed"),
                  // Leaving takes you out of this workspace: start again from the dashboard of the next one.
                  isSelf
                    ? () => {
                        router.replace("/dashboard");
                        router.refresh();
                      }
                    : undefined,
                )
              }
            >
              {isSelf ? t("team.leave") : t("team.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteWorkspaceCard({ workspaceName }: { workspaceName: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const { pending, formError, errorFor, submit } = useServerForm(async (value: string) => {
    const result = await deleteWorkspaceAction(value);
    if (result.ok) {
      router.replace("/dashboard");
      router.refresh();
    }
    return result;
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(confirmName);
  }

  const error = errorFor("confirmName") ?? errorFor("_form");
  return (
    <Card role="region" aria-labelledby="delete-workspace-title">
      <CardHeader>
        <CardTitle id="delete-workspace-title">{t("team.deleteTitle")}</CardTitle>
        <CardDescription>{t("team.deleteDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t("team.delete")}
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("team.deleteConfirmTitle", { name: workspaceName })}</DialogTitle>
              <DialogDescription>{t("team.deleteConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <FormField
              label={t("team.deleteConfirmLabel", { name: workspaceName })}
              htmlFor="delete-workspace-name"
              error={error}
            >
              <Input
                id="delete-workspace-name"
                autoComplete="off"
                value={confirmName}
                aria-invalid={Boolean(error) || undefined}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </FormField>
            {formError ? (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || confirmName.trim() !== workspaceName}>
                {t("team.delete")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * The members of the active workspace. Owners add members by the email they signed up with, change
 * roles, remove members and may delete the workspace; members only see who is on the team.
 */
export function TeamManager({
  members,
  currentUserId,
  isOwner,
  workspaceName,
}: {
  members: WorkspaceMember[];
  currentUserId: string;
  isOwner: boolean;
  workspaceName: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const joined = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium",
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {isOwner ? (
        <Card role="region" aria-labelledby="add-member-title">
          <CardHeader>
            <CardTitle id="add-member-title">{t("team.addTitle")}</CardTitle>
            <CardDescription>{t("team.addDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AddMemberForm />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted">{t("team.memberNotice")}</p>
      )}

      <Table aria-label={t("team.membersLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("team.member")}</TableHead>
            <TableHead>{t("team.role")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("team.joined")}</TableHead>
            {isOwner ? <TableHead className="w-12" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.userId}>
              <TableCell>
                <span className="block text-fg">
                  {member.name}
                  {member.userId === currentUserId ? <span className="text-muted"> ({t("team.you")})</span> : null}
                </span>
                <span className="block text-xs text-muted">{member.email}</span>
              </TableCell>
              <TableCell>
                <Badge variant={member.role === "owner" ? "info" : "neutral"}>
                  {t(`workspaces.roles.${member.role}`)}
                </Badge>
              </TableCell>
              <TableCell className="hidden text-muted sm:table-cell">
                {joined.format(new Date(member.joinedAt))}
              </TableCell>
              {isOwner ? (
                <TableCell className="text-right">
                  <MemberActions member={member} isSelf={member.userId === currentUserId} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {isOwner ? <DeleteWorkspaceCard workspaceName={workspaceName} /> : null}
    </div>
  );
}
