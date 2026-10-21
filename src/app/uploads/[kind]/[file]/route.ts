import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves files written by the local-disk storage (dev/test, see `@/lib/storage/local`). `next start`
 * only serves files that were in `public/` at boot, so files uploaded at runtime need this route.
 * With Vercel Blob configured, uploads get absolute blob URLs and this route is never hit.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};
const KIND_RE = /^(logo|payment-proof)$/;
const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; file: string }> }) {
  const { kind, file } = await params;
  const match = FILE_RE.exec(file);
  if (!KIND_RE.test(kind) || !match) return new Response("Not found", { status: 404 });

  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "uploads", kind, file));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": CONTENT_TYPES[match[1]],
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
