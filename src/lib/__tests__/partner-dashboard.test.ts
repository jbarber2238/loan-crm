import { describe, expect, it } from "vitest";
import { activityLine, bucketFor, howPaidFigures, shortDate, stageProgress, viewFor } from "@/lib/partner-dashboard";
import { borrowerDisplay } from "@/lib/partner-display";

describe("partner dashboard helpers", () => {
  it("folds the pipeline into four steps", () => {
    expect(bucketFor("submitted")).toBe("submitted");
    expect(["pricing", "application", "underwriting"].map((s) => bucketFor(s as never))).toEqual(["review", "review", "review"]);
    expect(bucketFor("clear_to_close")).toBe("closing");
    expect(bucketFor("closed")).toBe("funded");
  });

  it("shows the borrower's company, falling back to first name + last initial", () => {
    expect(borrowerDisplay("Calloway Builders LLC", "Dan Calloway")).toBe("Calloway Builders LLC");
    expect(borrowerDisplay("TBD", "Dan Calloway")).toBe("Dan C.");
    expect(borrowerDisplay(null, "Dan Calloway")).toBe("Dan C.");
  });

  it("writes activity lines, skipping moves inside a step", () => {
    const stage = (from: string | null, to: string) => activityLine({ type: "stage_change", payload: { from, to }, dealLabel: "Harbor Ridge LLC" });
    expect(stage("pricing", "application")).toBeNull();
    expect(stage("pricing", "clear_to_close")?.text).toBe("Harbor Ridge LLC moved to Closing");
    expect(stage("application", "pricing")).toBeNull();
    expect(stage("clear_to_close", "closed")?.text).toBe("Harbor Ridge LLC funded");
    expect(stage("submitted", "pricing")?.text).toBe("Harbor Ridge LLC moved to In review");
    expect(activityLine({ type: "payout_paid", payload: { amount: 660 }, dealLabel: null })).toEqual({ text: "$660 paid to you by ACH", paid: true });
    expect(activityLine({ type: "referral_submitted", payload: null, dealLabel: "Calloway" })?.text).toBe("Calloway referred");
    expect(activityLine({ type: "nudged", payload: null, dealLabel: null })).toBeNull();
  });

  it("works out the how-you-get-paid example from the partner's tier", () => {
    expect(howPaidFigures(20)).toMatchObject({ minimum: 500, examplePayout: 720 });
    expect(howPaidFigures(25)).toMatchObject({ minimum: 625, examplePayout: 900 });
  });

  it("formats dates as month and day", () => {
    expect(shortDate(new Date("2026-10-09T00:00:00Z"), "UTC")).toBe("Oct 9");
  });
});

describe("referral progress and tabs", () => {
  it("fills one more box for each step", () => {
    expect(stageProgress("submitted")).toEqual({ filled: 1, state: "moving" });
    expect(stageProgress("review")).toEqual({ filled: 2, state: "moving" });
    expect(stageProgress("closing")).toEqual({ filled: 3, state: "moving" });
    expect(stageProgress("funded")).toEqual({ filled: 4, state: "funded" });
  });

  it("shows a paused or stopped referral as unfilled", () => {
    expect(stageProgress("paused")).toEqual({ filled: 0, state: "stopped" });
    expect(stageProgress("didnt_proceed")).toEqual({ filled: 0, state: "stopped" });
  });

  it("sorts referrals into the Active, Funded and Didn't proceed tabs", () => {
    expect(["submitted", "review", "closing", "paused"].map((b) => viewFor(b as never))).toEqual(["active", "active", "active", "active"]);
    expect(viewFor("funded")).toBe("funded");
    expect(viewFor("didnt_proceed")).toBe("stopped");
  });
});
