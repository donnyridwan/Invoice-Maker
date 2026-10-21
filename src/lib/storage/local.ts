import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStorage, UploadKind } from "./index";

const URL_PREFIX = "/uploads/";

function uploadsRoot(): string {
  return path.join(process.cwd(), "public", "uploads");
}

/** Dev/test storage: files under `public/uploads/<kind>/<uuid>.<ext>`, served by Next as static files. */
export const localStorage: FileStorage = {
  async put(kind: UploadKind, bytes: Uint8Array, ext: string) {
    const name = `${randomUUID()}.${ext}`;
    const dir = path.join(uploadsRoot(), kind);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    return { url: `${URL_PREFIX}${kind}/${name}` };
  },

  async delete(url: string) {
    if (!url.startsWith(URL_PREFIX)) return;
    const root = uploadsRoot();
    const target = path.resolve(root, url.slice(URL_PREFIX.length));
    if (!target.startsWith(root + path.sep)) throw new Error("Refusing to delete outside the uploads folder");
    await rm(target, { force: true });
  },
};
