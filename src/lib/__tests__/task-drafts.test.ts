import { describe, expect, it } from "vitest";
import { matchAssignee, normalizeDraftTasks } from "@/lib/task-drafts";

const users = [
  { id: "u1", name: "Justin Barber" },
  { id: "u2", name: "Sarah Lee" },
  { id: "u3", name: "Sam Park" },
  { id: "u4", name: "Sam Cole" },
];

describe("matchAssignee", () => {
  it("matches a full name or a unique first name", () => {
    expect(matchAssignee("Sarah Lee", users, "u1")).toBe("u2");
    expect(matchAssignee("sarah", users, "u1")).toBe("u2");
  });
  it("treats me, the viewer's own name and unknown or ambiguous names as nobody (the default)", () => {
    expect(matchAssignee("me", users, "u1")).toBeNull();
    expect(matchAssignee("Justin", users, "u1")).toBeNull();
    expect(matchAssignee("Sam", users, "u1")).toBeNull();
    expect(matchAssignee("Bob", users, "u1")).toBeNull();
    expect(matchAssignee(undefined, users, "u1")).toBeNull();
  });
});

describe("normalizeDraftTasks", () => {
  it("keeps good tasks, drops empty titles and bad dates, and only keeps a time with a date", () => {
    const out = normalizeDraftTasks(
      {
        tasks: [
          { title: "  Call the   appraiser ", dueDate: "2026-11-20", dueTime: "14:30", assignee: "Sarah" },
          { title: "Order title", dueDate: "2026-02-31", dueTime: "09:00", assignee: null },
          { title: "Send payoff", dueDate: null, dueTime: "09:00", assignee: null },
          { title: "   ", dueDate: null, dueTime: null, assignee: null },
          "nonsense",
        ],
      },
      users,
      "u1"
    );
    expect(out).toEqual([
      { title: "Call the appraiser", dueDate: "2026-11-20", dueTime: "14:30", assignedToUserId: "u2" },
      { title: "Order title", dueDate: null, dueTime: null, assignedToUserId: null },
      { title: "Send payoff", dueDate: null, dueTime: null, assignedToUserId: null },
    ]);
  });
  it("returns nothing for a reply that isn't a task list", () => {
    expect(normalizeDraftTasks(null, users, "u1")).toEqual([]);
    expect(normalizeDraftTasks({ tasks: "x" }, users, "u1")).toEqual([]);
  });
});
