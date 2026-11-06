import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { listMembers } from "@/features/workspaces/queries";
import { TeamManager } from "@/features/workspaces/team-manager";
import { requireWorkspace } from "@/lib/workspace";

export default async function TeamPage() {
  const { user, workspace } = await requireWorkspace();
  const t = await getTranslations("team");
  const members = await listMembers(workspace.id);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { name: workspace.name })} />
      <TeamManager
        members={members}
        currentUserId={user.id}
        isOwner={workspace.role === "owner"}
        workspaceName={workspace.name}
      />
    </>
  );
}
