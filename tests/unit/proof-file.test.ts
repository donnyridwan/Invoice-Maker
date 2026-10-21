import { describe, expect, it } from "vitest";
import { MAX_PROOF_BYTES, checkProofFile } from "@/features/payment-claims/proof-file";

const MB = 1024 * 1024;

describe("checkProofFile", () => {
  it("accepts jpg, png and pdf up to 5 MB", () => {
    expect(checkProofFile({ name: "bukti.png", type: "image/png", size: 1000 })).toBeNull();
    expect(checkProofFile({ name: "bukti.JPG", type: "image/jpeg", size: MAX_PROOF_BYTES })).toBeNull();
    expect(checkProofFile({ name: "bukti.pdf", type: "application/pdf", size: 3 * MB })).toBeNull();
  });

  it("rejects a file above 5 MB with fileTooLarge", () => {
    expect(checkProofFile({ name: "bukti.png", type: "image/png", size: MAX_PROOF_BYTES + 1 })).toBe("fileTooLarge");
    expect(checkProofFile({ name: "scan.pdf", type: "application/pdf", size: 7 * MB })).toBe("fileTooLarge");
  });

  it("rejects other types with fileType", () => {
    expect(checkProofFile({ name: "doc.docx", type: "application/msword", size: 1000 })).toBe("fileType");
    expect(checkProofFile({ name: "anim.gif", type: "image/gif", size: 1000 })).toBe("fileType");
  });

  it("goes by the extension when the browser reports no MIME type, and by the MIME when the name has none", () => {
    expect(checkProofFile({ name: "bukti.jpeg", type: "", size: 1000 })).toBeNull();
    expect(checkProofFile({ name: "bukti", type: "image/png", size: 1000 })).toBeNull();
    expect(checkProofFile({ name: "bukti", type: "", size: 1000 })).toBe("fileType");
  });

  it("reports the size before the type", () => {
    expect(checkProofFile({ name: "big.gif", type: "image/gif", size: 9 * MB })).toBe("fileTooLarge");
  });
});
