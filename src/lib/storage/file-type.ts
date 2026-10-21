export type FileType = "jpg" | "png" | "webp" | "pdf";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, i) => bytes[offset + i] === value);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Detects the real type of an upload from its magic bytes. The MIME type and file name sent by the
 * client are never trusted. Returns null for anything that is not a supported type.
 */
export function detectFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  if (startsWith(bytes, ascii("%PDF-"))) return "pdf";
  return null;
}
