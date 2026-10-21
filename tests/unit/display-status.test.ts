import { describe, expect, it } from "vitest";
import { displayStatus, dueRelative } from "@/features/invoices/display-status";

const VIEWED = new Date("2026-10-20T03:00:00Z");

describe("displayStatus", () => {
  it("does not treat an invoice due today as overdue", () => {
    const inv = { status: "sent", dueDate: "2026-10-21", firstViewedAt: null } as const;
    expect(displayStatus(inv, "2026-10-21")).toBe("sent");
    expect(displayStatus(inv, "2026-10-22")).toBe("overdue");
  });

  it("shows viewed for a sent invoice that was opened", () => {
    expect(displayStatus({ status: "sent", dueDate: "2026-11-01", firstViewedAt: VIEWED }, "2026-10-21")).toBe("viewed");
  });

  it("prefers overdue over viewed", () => {
    expect(displayStatus({ status: "sent", dueDate: "2026-10-01", firstViewedAt: VIEWED }, "2026-10-21")).toBe("overdue");
  });

  it("maps payment_claimed to awaiting_confirmation unless overdue", () => {
    const inv = { status: "payment_claimed", dueDate: "2026-10-21", firstViewedAt: VIEWED } as const;
    expect(displayStatus(inv, "2026-10-21")).toBe("awaiting_confirmation");
    expect(displayStatus(inv, "2026-10-22")).toBe("overdue");
  });

  it("keeps paid, void and draft regardless of the due date", () => {
    const base = { dueDate: "2026-01-01", firstViewedAt: VIEWED };
    expect(displayStatus({ ...base, status: "paid" }, "2026-10-21")).toBe("paid");
    expect(displayStatus({ ...base, status: "void" }, "2026-10-21")).toBe("void");
    expect(displayStatus({ ...base, status: "draft", firstViewedAt: null }, "2026-10-21")).toBe("draft");
  });
});

describe("dueRelative", () => {
  it("describes the distance to the due date", () => {
    expect(dueRelative("2026-10-26", "2026-10-21")).toEqual({ kind: "inDays", days: 5 });
    expect(dueRelative("2026-10-18", "2026-10-21")).toEqual({ kind: "overdueDays", days: 3 });
    expect(dueRelative("2026-10-21", "2026-10-21")).toEqual({ kind: "today", days: 0 });
  });
});
