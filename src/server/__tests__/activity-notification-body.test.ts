import { describe, expect, it } from "vitest";

// borrower-activity.ts pulls in the DB client at import time; stub it so the
// pure text helper can be tested on its own.
import { vi } from "vitest";
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/gmail/send", () => ({ sendGmailAs: vi.fn() }));
vi.mock("@/server/settings", () => ({ getCompanyName: vi.fn(), getCompanyLogoHtml: vi.fn() }));
vi.mock("@/server/users", () => ({ getUserEmailSignatureHtml: vi.fn() }));
vi.mock("@/server/notifications", () => ({ createNotifications: vi.fn() }));

import { activityNotificationBody } from "@/server/borrower-activity";

describe("activityNotificationBody", () => {
  it("names a single item", () => {
    expect(activityNotificationBody(["Bank statements"])).toBe("Ready for review: Bank statements");
  });
  it("names two and three items", () => {
    expect(activityNotificationBody(["Bank statements", "Driver's license"])).toBe(
      "Ready for review: Bank statements and Driver's license"
    );
    expect(activityNotificationBody(["A", "B", "C"])).toBe("Ready for review: A, B, and C");
  });
  it("collapses duplicates (several files on one need)", () => {
    expect(activityNotificationBody(["Insurance", "Insurance"])).toBe("Ready for review: Insurance");
  });
  it("falls back to a count for four or more", () => {
    expect(activityNotificationBody(["A", "B", "C", "D"])).toBe("4 items ready for review");
  });
});
