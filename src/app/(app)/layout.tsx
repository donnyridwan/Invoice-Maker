import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { isOnboardingComplete } from "@/features/profile/queries";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  if (!(await isOnboardingComplete(user))) {
    // x-pathname is set by the proxy; without it we cannot tell where we are, so don't redirect.
    const pathname = (await headers()).get("x-pathname");
    if (pathname && !pathname.startsWith("/onboarding")) {
      redirect("/onboarding");
    }
  }

  return <AppShell user={user}>{children}</AppShell>;
}
