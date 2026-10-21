import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getStorage, uploadFile } from "@/lib/storage";
import { ValidationError } from "@/lib/errors";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const created: string[] = [];

const onDisk = (url: string) => path.join(process.cwd(), "public", url);

afterEach(async () => {
  await Promise.all(created.splice(0).map((url) => rm(onDisk(url), { force: true })));
});

describe("local file storage", () => {
  it("puts a file under public/uploads and deletes it again", async () => {
    expect(process.env.BLOB_READ_WRITE_TOKEN).toBeFalsy();
    const storage = getStorage();

    const { url } = await storage.put("logo", PNG, "png");
    created.push(url);
    expect(url).toMatch(/^\/uploads\/logo\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(onDisk(url))).toBe(true);

    await storage.delete(url);
    expect(existsSync(onDisk(url))).toBe(false);
    await expect(storage.delete(url)).resolves.toBeUndefined();
  });

  it("refuses to delete outside the uploads folder", async () => {
    await expect(getStorage().delete("/uploads/../package.json")).rejects.toThrow();
    expect(existsSync(path.join(process.cwd(), "package.json"))).toBe(true);
  });

  it("uploadFile validates before storing", async () => {
    const html = new File(["<html></html>"], "x.png", { type: "image/png" });
    await expect(uploadFile("logo", html)).rejects.toBeInstanceOf(ValidationError);

    const { url } = await uploadFile("logo", new File([PNG], "logo.png", { type: "image/png" }));
    created.push(url);
    expect(url).toMatch(/^\/uploads\/logo\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(onDisk(url))).toBe(true);
  });
});
