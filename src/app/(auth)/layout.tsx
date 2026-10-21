import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-subtle px-4 py-12">
      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-[400px]">
        <p className="mb-6 text-center text-xl font-semibold tracking-tight text-fg">Invoice Maker</p>
        {children}
      </div>
    </main>
  );
}
