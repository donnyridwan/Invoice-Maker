"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      toastOptions={{
        classNames: {
          toast: "!rounded-card !border !border-fg !bg-fg !text-white !text-sm !shadow-lg",
          description: "!text-white/70",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
