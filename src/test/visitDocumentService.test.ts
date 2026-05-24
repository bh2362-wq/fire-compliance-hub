import { describe, it, expect } from "vitest";
import { fileValidationError, ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "@/services/visitDocumentService";

// fileValidationError is the gate for engineer-uploaded visit documents.
// The message it returns is rendered verbatim to the engineer on a phone,
// so silent regressions (typo in the cap, an allowed type dropped, etc.)
// would surface as user-facing nonsense — hence direct coverage of every
// reject path plus the happy path for every allowed MIME.

function makeFile(name: string, bytes: number, type: string): File {
  // jsdom's File backs size from the blob's byte length.
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("fileValidationError", () => {
  it("accepts a small PDF", () => {
    const f = makeFile("report.pdf", 100, "application/pdf");
    expect(fileValidationError(f)).toBeNull();
  });

  it("accepts every advertised MIME type", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const f = makeFile(`x.${mime.split("/")[1]}`, 100, mime);
      expect(fileValidationError(f), `mime ${mime} should be accepted`).toBeNull();
    }
  });

  it("rejects a file just over the 25 MB cap with the size message", () => {
    const f = makeFile("huge.pdf", MAX_FILE_BYTES + 1, "application/pdf");
    const err = fileValidationError(f);
    expect(err).toContain("huge.pdf");
    expect(err).toContain("25 MB");
  });

  it("accepts a file exactly at the 25 MB cap", () => {
    const f = makeFile("edge.pdf", MAX_FILE_BYTES, "application/pdf");
    expect(fileValidationError(f)).toBeNull();
  });

  it("rejects an unknown MIME type with the type message", () => {
    const f = makeFile("weird.xyz", 100, "application/x-binary");
    const err = fileValidationError(f);
    expect(err).toContain("weird.xyz");
    expect(err).toContain("PDF");
  });

  it("rejects a file with no MIME type", () => {
    const f = makeFile("unknown", 100, "");
    expect(fileValidationError(f)).not.toBeNull();
  });

  it("size check fires before type check", () => {
    // Both invalid — size message must win (it's the more obvious user complaint).
    const f = makeFile("huge.xyz", MAX_FILE_BYTES + 1, "application/x-binary");
    expect(fileValidationError(f)).toContain("25 MB");
  });
});
