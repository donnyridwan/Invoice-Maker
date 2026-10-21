import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/dashboard">Dashboard</Link>
      </Button>
    </main>
  );
}
