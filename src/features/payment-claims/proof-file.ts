/** Same limit as the server (`UPLOAD_RULES["payment-proof"]`); duplicated so the browser bundle stays free of server-only code. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

/**
 * A browser-side convenience check of a chosen proof file, so the client sees the problem at once
 * instead of after a failed upload. Returns the `validation` message key, or null when the file
 * looks fine. The server still decides by the file's magic bytes.
 */
export function checkProofFile(file: { name: string; type: string; size: number }): "fileTooLarge" | "fileType" | null {
  if (file.size > MAX_PROOF_BYTES) return "fileTooLarge";
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) return "fileType";
  return null;
}
