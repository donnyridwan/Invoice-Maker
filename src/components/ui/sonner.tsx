"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      toastOptions={{
        classNames: {
          toast: "!rounded-none !border !border-border !bg-white !text-fg !text-sm !shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
          description: "!text-muted",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
