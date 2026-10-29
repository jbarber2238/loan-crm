import { describe, expect, it } from "vitest";
import { campaignHealth, capStatus, projectSend, type SendLimitsInput } from "@/lib/send-limits";

const base: SendLimitsInput = { used24h: 0, dailyLimit: 2000, campaignUsed24h: 0, campaignDailyMax: 200 };

describe("capStatus", () => {
  it("moves through the levels as the day fills", () => {
    expect(capStatus({ ...base, used24h: 100 }).level).toBe("ok");
    expect(capStatus({ ...base, used24h: 1400 }).level).toBe("watch");
    expect(capStatus({ ...base, used24h: 1700 }).level).toBe("near");
    expect(capStatus({ ...base, used24h: 1800 }).level).toBe("full");
  });
  it("leaves room for everyday email: campaigns stop at 90% and at their own daily max", () => {
    expect(capStatus(base).campaignRoom).toBe(200);
    expect(capStatus({ ...base, campaignUsed24h: 150 }).campaignRoom).toBe(50);
    expect(capStatus({ ...base, used24h: 1750, campaignUsed24h: 10 }).campaignRoom).toBe(50);
    expect(capStatus({ ...base, used24h: 1900 }).campaignRoom).toBe(0);
  });
  it("uses the smaller free-account limit", () => {
    expect(capStatus({ used24h: 460, dailyLimit: 500, campaignUsed24h: 0, campaignDailyMax: 200 }).level).toBe("full");
  });
});

describe("projectSend", () => {
  it("says when everyone fits today", () => {
    expect(projectSend(base, 150).fitsToday).toBe(true);
  });
  it("spreads a big send over days", () => {
    const p = projectSend(base, 650);
    expect(p.fitsToday).toBe(false);
    expect(p.days).toBeGreaterThanOrEqual(3);
    expect(p.message).toContain("spread over");
  });
});

describe("campaignHealth", () => {
  const c = (over: Partial<Parameters<typeof campaignHealth>[0]>) => ({ sent: 100, failed: 0, bounced: 0, unsubscribed: 0, clicked: 0, ...over });
  it("is fine when numbers are low", () => {
    expect(campaignHealth(c({ bounced: 1, unsubscribed: 0 })).level).toBe("ok");
  });
  it("watches at 2% bounces and stops at 5%", () => {
    expect(campaignHealth(c({ bounced: 2 })).level).toBe("watch");
    expect(campaignHealth(c({ bounced: 5 })).level).toBe("pause");
  });
  it("stops on send failures and heavy unsubscribes", () => {
    expect(campaignHealth(c({ failed: 6 })).level).toBe("pause");
    expect(campaignHealth(c({ unsubscribed: 3 })).level).toBe("pause");
    expect(campaignHealth(c({ unsubscribed: 1 })).level).toBe("watch");
  });
  it("ignores percentages on tiny sends but flags a pile-up of bounces", () => {
    expect(campaignHealth(c({ sent: 5, unsubscribed: 2 })).level).toBe("ok");
    expect(campaignHealth(c({ sent: 10, bounced: 3 })).level).toBe("watch");
  });
});
