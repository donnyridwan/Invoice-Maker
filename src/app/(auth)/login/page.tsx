import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, expired } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} expired={expired !== undefined} />;
}
