import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { detectFileType } from "@/lib/storage/file-type";
import { validateUpload } from "@/lib/storage";
import { imageSize } from "@/lib/storage/image-size";
import { checkLogoSize } from "@/lib/storage/logo-rules";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")]);
const PDF = ascii("%PDF-1.7\n");

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
/** The start of a PNG: signature and IHDR with the given size. */
const pngOf = (w: number, h: number) =>
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0);
/** A JPEG with an APP0 segment, then a baseline start-of-frame. */
const jpgOf = (w: number, h: number) =>
  bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0);
/** An extended WebP (VP8X). */
const webpOf = (w: number, h: number) =>
  new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
const LOGO_PNG = pngOf(600, 400);

function fieldError(fn: () => unknown): string[] | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.fieldErrors.file;
    throw e;
  }
  return undefined;
}

describe("detectFileType", () => {
  it("detects by magic bytes", () => {
    expect(detectFileType(PNG)).toBe("png");
    expect(detectFileType(JPG)).toBe("jpg");
    expect(detectFileType(WEBP)).toBe("webp");
    expect(detectFileType(PDF)).toBe("pdf");
  });

  it("rejects anything else", () => {
    expect(detectFileType(ascii("<html>"))).toBeNull();
    expect(detectFileType(ascii("<svg xmlns="))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
    expect(detectFileType(ascii("RIFF....WAVE"))).toBeNull();
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts allowed types", () => {
    expect(validateUpload("logo", { bytes: LOGO_PNG, size: 1000 })).toBe("png");
    expect(validateUpload("payment-proof", { bytes: PDF, size: 1000 })).toBe("pdf");
  });

  it("rejects a type that is not allowed for the kind", () => {
    expect(fieldError(() => validateUpload("logo", { bytes: PDF, size: 1000 }))).toEqual(["fileType"]);
    expect(fieldError(() => validateUpload("payment-proof", { bytes: WEBP, size: 1000 }))).toEqual(["fileType"]);
    expect(fieldError(() => validateUpload("logo", { bytes: ascii("<html>"), size: 6 }))).toEqual(["fileType"]);
  });

  it("rejects files over the size limit", () => {
    expect(fieldError(() => validateUpload("logo", { bytes: LOGO_PNG, size: 2 * 1024 * 1024 + 1 }))).toEqual([
      "fileTooLarge",
    ]);
    expect(validateUpload("logo", { bytes: LOGO_PNG, size: 2 * 1024 * 1024 })).toBe("png");
    expect(fieldError(() => validateUpload("payment-proof", { bytes: PDF, size: 5 * 1024 * 1024 + 1 }))).toEqual([
      "fileTooLarge",
    ]);
  });
});

describe("imageSize", () => {
  it("reads the size from PNG, JPEG and WebP headers", () => {
    expect(imageSize(pngOf(600, 400), "png")).toEqual({ width: 600, height: 400 });
    expect(imageSize(jpgOf(1024, 768), "jpg")).toEqual({ width: 1024, height: 768 });
    expect(imageSize(webpOf(800, 200), "webp")).toEqual({ width: 800, height: 200 });
  });

  it("gives up on a header it cannot read", () => {
    expect(imageSize(PNG, "png")).toBeNull();
    expect(imageSize(JPG, "jpg")).toBeNull();
    expect(imageSize(WEBP, "webp")).toBeNull();
  });
});

describe("logo rules", () => {
  it("takes a logo of at least 512 × 128 px, at most 4000 px a side and 6:1", () => {
    expect(checkLogoSize({ width: 512, height: 512 })).toBeNull();
    expect(checkLogoSize({ width: 768, height: 128 })).toBeNull();
    expect(checkLogoSize({ width: 48, height: 32 })).toBe("logoTooSmall");
    expect(checkLogoSize({ width: 511, height: 400 })).toBe("logoTooSmall");
    expect(checkLogoSize({ width: 600, height: 120 })).toBe("logoTooSmall");
    expect(checkLogoSize({ width: 4001, height: 2000 })).toBe("logoTooBig");
    expect(checkLogoSize({ width: 1400, height: 200 })).toBe("logoRatio");
  });

  it("is enforced on upload", () => {
    expect(fieldError(() => validateUpload("logo", { bytes: pngOf(48, 32), size: 775 }))).toEqual(["logoTooSmall"]);
    expect(fieldError(() => validateUpload("logo", { bytes: webpOf(1400, 200), size: 9000 }))).toEqual(["logoRatio"]);
    expect(fieldError(() => validateUpload("logo", { bytes: PNG, size: 12 }))).toEqual(["fileType"]);
    // Payment proofs keep any size.
    expect(validateUpload("payment-proof", { bytes: pngOf(48, 32), size: 775 })).toBe("png");
  });
});
