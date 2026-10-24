"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkLogoSize } from "@/lib/storage/logo-rules";
import { useServerForm } from "@/lib/use-server-form";
import { removeLogoAction, uploadLogoAction } from "./actions";

const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Checks a picked logo in the browser before it is sent, so a wrong file is turned down at once
 * (the server checks it again): its type, its size in bytes and its pixel size. Returns the
 * validation key of the first problem, or null.
 */
async function checkLogoFile(file: File): Promise<string | null> {
  if (!LOGO_TYPES.includes(file.type)) return "fileType";
  if (file.size > LOGO_MAX_BYTES) return "fileTooLarge";
  try {
    const bitmap = await createImageBitmap(file);
    const problem = checkLogoSize({ width: bitmap.width, height: bitmap.height });
    bitmap.close();
    return problem;
  } catch {
    return "fileType";
  }
}

export function LogoUpload({ logoUrl }: { logoUrl: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useServerForm<FormData>((formData) => uploadLogoAction(formData));
  const remove = useServerForm<void>(() => removeLogoAction());
  const [checkError, setCheckError] = useState<string | null>(null);
  const pending = upload.pending || remove.pending;
  const error = checkError ?? upload.errorFor("file") ?? upload.formError ?? remove.formError;

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const problem = await checkLogoFile(file);
    setCheckError(problem ? t(`validation.${problem}`) : null);
    if (problem) {
      input.value = "";
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    const ok = await upload.submit(formData);
    input.value = "";
    // The server action revalidates /settings; the new URL arrives with the refreshed page.
    if (ok) router.refresh();
  }

  async function onRemove() {
    if (await remove.submit()) {
      toast.success(t("settings.logoRemoved"));
      router.refresh();
    }
  }

  return (
    <Card role="region" aria-labelledby="logo-title">
      <CardHeader>
        <CardTitle id="logo-title">{t("settings.logo")}</CardTitle>
        <CardDescription>{t("settings.logoDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-subtle">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={t("settings.logoAlt")} className="size-full object-contain" />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                id="logo-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label={t("settings.logo")}
                onChange={onFileChange}
              />
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
                {logoUrl ? t("settings.logoChange") : t("settings.logoUpload")}
              </Button>
              {logoUrl ? (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
                  {t("settings.logoRemove")}
                </Button>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted">{t("settings.logoHint")}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
