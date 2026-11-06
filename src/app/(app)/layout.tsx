import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { isOnboardingComplete } from "@/features/profile/queries";
import { requireWorkspace } from "@/lib/workspace";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, workspace, workspaces } = await requireWorkspace();

  if (!(await isOnboardingComplete(workspace.id))) {
    // x-pathname is set by the proxy; without it we cannot tell where we are, so don't redirect.
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !pathname.startsWith("/onboarding")) {
      redirect("/onboarding");
    }
  }

  return (
    <AppShell user={user} workspace={workspace} workspaces={workspaces}>
      {children}
    </AppShell>
  );
}
