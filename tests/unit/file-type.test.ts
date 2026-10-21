import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { detectFileType } from "@/lib/storage/file-type";
import { validateUpload } from "@/lib/storage";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBPVP8 ")]);
const PDF = ascii("%PDF-1.7\n");

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
    expect(validateUpload("logo", { bytes: PNG, size: 1000 })).toBe("png");
    expect(validateUpload("payment-proof", { bytes: PDF, size: 1000 })).toBe("pdf");
  });

  it("rejects a type that is not allowed for the kind", () => {
    expect(fieldError(() => validateUpload("logo", { bytes: PDF, size: 1000 }))).toEqual(["fileType"]);
    expect(fieldError(() => validateUpload("payment-proof", { bytes: WEBP, size: 1000 }))).toEqual(["fileType"]);
    expect(fieldError(() => validateUpload("logo", { bytes: ascii("<html>"), size: 6 }))).toEqual(["fileType"]);
  });

  it("rejects files over the size limit", () => {
    expect(fieldError(() => validateUpload("logo", { bytes: PNG, size: 2 * 1024 * 1024 + 1 }))).toEqual(["fileTooLarge"]);
    expect(validateUpload("logo", { bytes: PNG, size: 2 * 1024 * 1024 })).toBe("png");
    expect(fieldError(() => validateUpload("payment-proof", { bytes: PDF, size: 5 * 1024 * 1024 + 1 }))).toEqual([
      "fileTooLarge",
    ]);
  });
});
