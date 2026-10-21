import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import type { FileStorage, UploadKind } from "./index";

/** Production storage (Vercel Blob). Used only when `BLOB_READ_WRITE_TOKEN` is set. */
export const vercelBlobStorage: FileStorage = {
  async put(kind: UploadKind, bytes: Uint8Array, ext: string) {
    const blob = await put(`${kind}/${randomUUID()}.${ext}`, Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: false,
    });
    return { url: blob.url };
  },

  async delete(url: string) {
    await del(url);
  },
};
