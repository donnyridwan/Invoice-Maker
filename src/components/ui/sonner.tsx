"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-border !bg-white !text-fg !text-sm",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
