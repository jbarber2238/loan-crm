import { describe, expect, it } from "vitest";
import { buildChart, model, money, monthsText, netCross, num, signed, workbookVerdict, type BuydownInputs } from "../buydown-calc";
import { buildBuydownXlsx } from "../buydown-excel-export";
import { BUYDOWN_WORKBOOK_PARTS_B64 } from "../buydown-workbook-parts";

// The original workbook's own defaults and the results it shows for them.
const WORKBOOK: BuydownInputs = { L: 400000, r0: 0.0799, r1: 0.0775, T: 30, io: false, pts: 0.01, extra: 0, same: 5000 };

describe("buy-down math", () => {
  it("matches the workbook for an amortizing loan", () => {
    const m = model(WORKBOOK);
    expect(m.up).toBe(4000);
    expect(m.p0).toBeCloseTo(2932.270296, 5);
    expect(m.p1).toBeCloseTo(2865.648982, 5);
    expect(m.save).toBeCloseTo(66.62131391, 6);
    expect(m.be).toBeCloseTo(60.04084527, 6);
    const at = m.at(65);
    expect(at.saved).toBeCloseTo(4330.385404, 4);
    expect(at.b0).toBeCloseTo(378215.2861, 3);
    expect(at.b1).toBeCloseTo(377286.8705, 3);
    expect(at.pay).toBeCloseTo(928.4156273, 4);
    expect(at.net).toBeCloseTo(1258.801031, 4);
    expect(workbookVerdict(m, 65)).toBe("The buy-down pays for itself before you exit");
  });

  it("matches the workbook's By Hold Time tab", () => {
    const m = model(WORKBOOK);
    expect(m.at(6).net).toBeCloseTo(-3519.513751, 4);
    expect(m.at(36).net).toBeCloseTo(-1100.715958, 4);
    expect(m.at(60).net).toBeCloseTo(850.8341729, 4);
    expect(m.at(120).net).toBeCloseTo(5755.4504, 3);
  });

  it("counts no principal paydown on an interest-only loan", () => {
    const m = model({ ...WORKBOOK, io: true });
    expect(m.p0).toBeCloseTo((400000 * 0.0799) / 12, 8);
    expect(m.save).toBeCloseTo(80, 8);
    expect(m.be).toBeCloseTo(50, 8);
    expect(m.at(65).pay).toBe(0);
    expect(m.at(65).b1).toBe(400000);
    expect(m.at(65).net).toBeCloseTo(1200, 6);
  });

  it("never pays back when the rate doesn't drop", () => {
    const m = model({ ...WORKBOOK, r1: WORKBOOK.r0 });
    expect(m.be).toBeNull();
    expect(workbookVerdict(m, 65)).toBe("No monthly savings, so the buy-down never pays back");
    expect(netCross(m, 120)).toBeNull();
  });

  it("says skip it when the exit comes before the pay-back", () => {
    const m = model(WORKBOOK);
    expect(m.at(24).net).toBeLessThan(0);
    expect(workbookVerdict(m, 24)).toBe("You exit before the buy-down pays back: skip it");
  });

  it("stops counting at the end of the loan term", () => {
    const m = model({ ...WORKBOOK, T: 5 });
    expect(m.at(200).saved).toBeCloseTo(m.save * 60, 6);
  });

  it("turns positive a little before the payment-only break-even, because principal counts too", () => {
    const m = model(WORKBOOK);
    const cross = netCross(m, 120)!;
    expect(cross).toBeGreaterThan(40);
    expect(cross).toBeLessThan(m.be!);
    expect(m.at(cross).net).toBeCloseTo(0, 4);
  });
});

describe("buy-down formatting", () => {
  it("reads what people type", () => {
    expect(num("$400,000")).toBe(400000);
    expect(num("7.99%")).toBe(7.99);
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
  });
  it("formats money, with a sign when asked", () => {
    expect(money(1258.8)).toBe("$1,259");
    expect(money(-1624.99)).toBe("-$1,625");
    expect(money(66.6213, 2)).toBe("$66.62");
    expect(money(-0.2)).toBe("$0");
    expect(signed(1258.8)).toBe("+$1,259");
    expect(signed(-1625)).toBe("-$1,625");
    expect(signed(0)).toBe("$0");
  });
  it("words the break-even month", () => {
    expect(monthsText(60.04084527)).toBe("60");
    expect(monthsText(29.96)).toBe("30");
    expect(monthsText(12.34)).toBe("12.3");
    expect(monthsText(null)).toBe("Never");
  });
});

describe("buy-down chart", () => {
  it("keeps every point and label inside the drawing", () => {
    const m = model(WORKBOOK);
    const c = buildChart([{ m, name: "Your quote" }], 120, 65, [6, 12, 24, 36, 60, 84, 120], true, "Month 65: +$1,259");
    for (const pair of c.lines[0].split(" ")) {
      const [x, y] = pair.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(c.xL);
      expect(x).toBeLessThanOrEqual(c.xR);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(c.H);
    }
    expect(c.dots).toHaveLength(7);
    expect(c.dots.filter((d) => d.ahead)).toHaveLength(3); // 60, 84 and 120 months
    expect(c.hold).not.toBeNull();
    expect(c.crossPill?.text).toMatch(/^Pays back ~ month \d+$/);
    expect(c.labels).toEqual([expect.objectContaining({ text: "Your quote", series: 0 })]);
  });
  it("leaves out the exit marker when it's past the end of the chart", () => {
    const c = buildChart([{ m: model(WORKBOOK), name: "" }], 120, 200, [], false, "x");
    expect(c.hold).toBeNull();
    expect(c.labels).toHaveLength(0);
    expect(c.negArea).toBeNull();
  });
});

describe("buy-down Excel file", () => {
  const sheet = (bytes: Uint8Array, name: string) => {
    // The zip is stored uncompressed, so each sheet's XML is readable straight out of the bytes: a file's name is
    // immediately followed by its contents.
    const text = new TextDecoder().decode(bytes);
    const start = text.indexOf(name + "<?xml");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf("</worksheet>", start));
  };
  const cell = (xml: string, ref: string) => new RegExp(`<c r="${ref}"[^>]*>(?:<f[^>]*>[\\s\\S]*?</f>|<f[^>]*/>)?<v>([^<]*)</v>`).exec(xml)?.[1];

  it("fills in the inputs and keeps the formulas", () => {
    const bytes = buildBuydownXlsx(BUYDOWN_WORKBOOK_PARTS_B64, { ...WORKBOOK, L: 650000, pts: 0.0125, io: true }, 24, [6, 12, 24, 36, 60, 84, 120]);
    expect(bytes[0]).toBe(0x50); // "PK"
    expect(bytes[1]).toBe(0x4b);
    const s1 = sheet(bytes, "xl/worksheets/sheet1.xml");
    expect(cell(s1, "B5")).toBe("650000");
    expect(cell(s1, "B12")).toBe("0.0125");
    expect(cell(s1, "B13")).toBe("0");
    expect(cell(s1, "B17")).toBe("24");
    expect(cell(s1, "B9")).toBe("2"); // the dropdown's "Interest-only"
    expect(s1).toContain("<f>B5*B12+B13</f>");
    expect(Number(cell(s1, "B20"))).toBeCloseTo(8125, 6);
    expect(new TextDecoder().decode(bytes)).toContain('<calcPr fullCalcOnLoad="1"/>');
  });

  it("writes the seven hold times", () => {
    const bytes = buildBuydownXlsx(BUYDOWN_WORKBOOK_PARTS_B64, WORKBOOK, 65, [3, 9, 18, 30, 48, 72, 96]);
    const s2 = sheet(bytes, "xl/worksheets/sheet2.xml");
    expect(cell(s2, "A5")).toBe("3");
    expect(cell(s2, "A11")).toBe("96");
    expect(Number(cell(s2, "F11"))).toBeCloseTo(model(WORKBOOK).at(96).net, 6);
  });
});
