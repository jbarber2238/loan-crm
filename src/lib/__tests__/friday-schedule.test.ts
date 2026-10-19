import { describe, expect, it } from "vitest";
import {
  addDays,
  buildIcs,
  etDay,
  etToUtc,
  formatSession,
  isAtOrAfterEt,
  latestSessionDayBefore,
  nextSessionDay,
  sessionStart,
} from "@/lib/friday-schedule";

// 2026-10-23 is a Friday (EDT, UTC-4); 2026-11-06 is also a Friday, after DST ends (EST, UTC-5).
const at = (iso: string) => new Date(iso);

describe("next Friday session", () => {
  it("is this Friday for anyone signing up earlier in the week", () => {
    expect(nextSessionDay(at("2026-10-19T14:00:00Z"))).toBe("2026-10-23"); // Monday
    expect(nextSessionDay(at("2026-10-22T23:00:00Z"))).toBe("2026-10-23"); // Thursday evening
  });

  it("stays on today until 11:00 AM ET on Friday, then rolls to next week", () => {
    expect(nextSessionDay(at("2026-10-23T14:59:00Z"))).toBe("2026-10-23"); // 10:59 AM EDT
    expect(nextSessionDay(at("2026-10-23T15:00:00Z"))).toBe("2026-10-30"); // 11:00 AM EDT
    expect(nextSessionDay(at("2026-10-23T22:00:00Z"))).toBe("2026-10-30"); // afternoon
  });

  it("looks ahead from the weekend", () => {
    expect(nextSessionDay(at("2026-10-24T13:00:00Z"))).toBe("2026-10-30"); // Saturday
  });

  it("uses Eastern time for the day, not UTC", () => {
    // 9 PM Thursday ET is already Friday in UTC; still Thursday for us.
    expect(etDay(at("2026-10-23T01:00:00Z"))).toBe("2026-10-22");
    expect(nextSessionDay(at("2026-10-23T01:00:00Z"))).toBe("2026-10-23");
  });
});

describe("session time", () => {
  it("is noon Eastern in both daylight and standard time", () => {
    expect(sessionStart("2026-10-23").toISOString()).toBe("2026-10-23T16:00:00.000Z");
    expect(sessionStart("2026-11-06").toISOString()).toBe("2026-11-06T17:00:00.000Z");
  });

  it("converts Eastern wall-clock times", () => {
    expect(etToUtc("2026-10-24", 9).toISOString()).toBe("2026-10-24T13:00:00.000Z");
  });

  it("writes the session in plain words", () => {
    expect(formatSession("2026-10-23")).toBe("Friday, October 23 at 12:00 PM ET");
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06");
  });
});

describe("session timing helpers", () => {
  it("finds the latest session once enough time has passed", () => {
    expect(latestSessionDayBefore(at("2026-10-23T16:44:00Z"), 45)).toBeNull(); // 12:44 PM
    expect(latestSessionDayBefore(at("2026-10-23T16:46:00Z"), 45)).toBe("2026-10-23");
    expect(latestSessionDayBefore(at("2026-10-24T13:00:00Z"), 45)).toBe("2026-10-23"); // Saturday
    expect(latestSessionDayBefore(at("2026-10-28T13:00:00Z"), 45)).toBeNull(); // too old
  });

  it("knows when 3:00 PM ET on the day has arrived", () => {
    expect(isAtOrAfterEt(at("2026-10-23T18:59:00Z"), "2026-10-23", 15)).toBe(false);
    expect(isAtOrAfterEt(at("2026-10-23T19:00:00Z"), "2026-10-23", 15)).toBe(true);
  });
});

describe("calendar file", () => {
  it("carries the start time and the join link", () => {
    const ics = buildIcs({ uid: "abc", day: "2026-10-23", joinUrl: "https://zoom.us/j/1" });
    expect(ics).toContain("DTSTART:20261023T160000Z");
    expect(ics).toContain("DTEND:20261023T163000Z");
    expect(ics).toContain("LOCATION:https://zoom.us/j/1");
  });
});
