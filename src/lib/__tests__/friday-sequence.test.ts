import { describe, expect, it } from "vitest";
import { afterAttended, afterNoShow, splitByAttendance, undoNoShow } from "@/lib/friday-sequence";

describe("Friday attendance rules", () => {
  it("rebooks after one no-show and stops after two", () => {
    expect(afterNoShow({ noShowCount: 0 })).toEqual({ noShowCount: 1, emailOnly: false });
    expect(afterNoShow({ noShowCount: 1 })).toEqual({ noShowCount: 2, emailOnly: true });
  });

  it("clears the count when someone attends", () => {
    expect(afterAttended()).toEqual({ noShowCount: 0, emailOnly: false });
  });

  it("undoes a wrong no-show", () => {
    expect(undoNoShow({ noShowCount: 1 })).toEqual({ noShowCount: 0, emailOnly: false });
    expect(undoNoShow({ noShowCount: 2 })).toEqual({ noShowCount: 1, emailOnly: false });
  });

  it("matches Zoom's attendee emails without caring about case or spaces", () => {
    const people = [{ email: "Pat@Example.com " }, { email: "sam@example.com" }];
    const { present, absent } = splitByAttendance(people, new Set(["pat@example.com"]));
    expect(present).toEqual([people[0]]);
    expect(absent).toEqual([people[1]]);
  });
});
