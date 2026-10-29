import { describe, expect, it } from "vitest";
import { analyzeAuth, mergeSpf } from "@/lib/email-auth";

const base = { domain: "example.com", txt: [] as string[], dmarc: [] as string[], dkim: [] as string[] };
const find = (r: ReturnType<typeof analyzeAuth>, id: string) => r.find((c) => c.id === id)!;

describe("mergeSpf", () => {
  it("combines several records into one that includes Google", () => {
    const merged = mergeSpf(["v=spf1 ~all", "v=spf1 include:mailgun.org ~all", "v=spf1 include:spf.efwd.registrar-servers.com ~all"]);
    expect(merged).toBe("v=spf1 include:_spf.google.com include:mailgun.org include:spf.efwd.registrar-servers.com ~all");
  });
  it("keeps a strict -all and never loosens to +all", () => {
    expect(mergeSpf(["v=spf1 include:a.com -all"])).toContain("-all");
    expect(mergeSpf(["v=spf1 +all"])).toMatch(/~all$/);
  });
});

describe("analyzeAuth", () => {
  it("flags multiple SPF records and gives a merged value", () => {
    const spf = find(analyzeAuth({ ...base, txt: ["v=spf1 ~all", "v=spf1 include:mailgun.org ~all"] }), "spf");
    expect(spf.status).toBe("bad");
    expect(spf.detail).toContain("2 separate SPF records");
    expect(spf.suggested).toContain("include:_spf.google.com");
  });
  it("flags an SPF record without Google", () => {
    expect(find(analyzeAuth({ ...base, txt: ["v=spf1 include:mailgun.org ~all"] }), "spf").status).toBe("bad");
  });
  it("passes a single SPF record with Google", () => {
    expect(find(analyzeAuth({ ...base, txt: ["v=spf1 include:_spf.google.com ~all"] }), "spf").status).toBe("ok");
  });
  it("needs a DKIM key", () => {
    expect(find(analyzeAuth(base), "dkim").status).toBe("bad");
    expect(find(analyzeAuth({ ...base, dkim: ["v=DKIM1; k=rsa; p=MIIBIjANBg"] }), "dkim").status).toBe("ok");
  });
  it("treats DMARC p=none as a start and quarantine as done", () => {
    expect(find(analyzeAuth({ ...base, dmarc: ["v=DMARC1;p=none; rua=mailto:x@y.com"] }), "dmarc").status).toBe("warn");
    expect(find(analyzeAuth({ ...base, dmarc: ["v=DMARC1; p=quarantine"] }), "dmarc").status).toBe("ok");
    expect(find(analyzeAuth(base), "dmarc").status).toBe("bad");
  });
});
