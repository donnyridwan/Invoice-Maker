import { ValidationError } from "@/lib/errors";
import { detectFileType, type FileType } from "./file-type";
import { localStorage } from "./local";
import { vercelBlobStorage } from "./vercel-blob";

export type UploadKind = "logo" | "payment-proof";

const MB = 1024 * 1024;

export const UPLOAD_RULES: Record<UploadKind, { types: FileType[]; maxBytes: number }> = {
  logo: { types: ["jpg", "png", "webp"], maxBytes: 2 * MB },
  "payment-proof": { types: ["jpg", "png", "pdf"], maxBytes: 5 * MB },
};

export interface FileStorage {
  put(kind: UploadKind, bytes: Uint8Array, ext: string): Promise<{ url: string }>;
  delete(url: string): Promise<void>;
}

/**
 * Checks an upload against the rules of its kind and returns its real type (from magic bytes).
 * Throws `ValidationError({ file: ['fileType'] | ['fileTooLarge'] })`.
 */
export function validateUpload(kind: UploadKind, file: { bytes: Uint8Array; size: number }): FileType {
  const rules = UPLOAD_RULES[kind];
  const type = detectFileType(file.bytes);
  if (!type || !rules.types.includes(type)) throw new ValidationError({ file: ["fileType"] });
  if (file.size > rules.maxBytes) throw new ValidationError({ file: ["fileTooLarge"] });
  return type;
}

export function getStorage(): FileStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? vercelBlobStorage : localStorage;
}

/** Validates `file` and stores it under a random name; returns its public URL. */
export async function uploadFile(kind: UploadKind, file: File): Promise<{ url: string }> {
  // Cheap size check before the file is read into memory.
  if (file.size > UPLOAD_RULES[kind].maxBytes) throw new ValidationError({ file: ["fileTooLarge"] });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = validateUpload(kind, { bytes, size: file.size });
  return getStorage().put(kind, bytes, type);
}
