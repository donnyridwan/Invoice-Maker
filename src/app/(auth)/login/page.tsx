import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getOptionalUser } from "@/lib/session";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, expired } = await searchParams;

  // `?expired=1` means the proxy saw a session cookie the server rejected. When the session is
  // actually valid (e.g. a stale link), keep the user signed in and send them on instead of
  // letting the form sign them out.
  const user = expired !== undefined ? await getOptionalUser() : null;
  if (user) redirect("/dashboard");

  return <LoginForm next={typeof next === "string" ? next : undefined} expired={expired !== undefined} />;
}
