import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  findMentionedIds,
  matchMentionPeople,
  mentionHandle,
  splitMentions,
} from "@/lib/chat-mentions";

const people = [
  { id: "j", name: "Jennivive Ostara" },
  { id: "e", name: "Emily Stone" },
  { id: "a1", name: "Anna Lee" },
  { id: "a2", name: "Anna Cho" },
];

describe("mentionHandle", () => {
  it("uses the first name when it is unique, the full name when shared", () => {
    expect(mentionHandle(people[0], people)).toBe("Jennivive");
    expect(mentionHandle(people[2], people)).toBe("Anna Lee");
  });
});

describe("findMentionedIds", () => {
  it("finds first-name tags in any case", () => {
    expect(findMentionedIds("hey @jennivive and @EMILY, can you look?", people)).toEqual(["j", "e"]);
  });
  it("needs the full name when two people share a first name", () => {
    expect(findMentionedIds("@Anna Lee please call", people)).toEqual(["a1"]);
    expect(findMentionedIds("@Anna please call", people)).toEqual([]);
  });
  it("accepts a full name even when the first name is unique", () => {
    expect(findMentionedIds("@Emily Stone ok?", people)).toEqual(["e"]);
  });
  it("ignores an email address and a name that merely starts with the handle", () => {
    expect(findMentionedIds("send to emily@example.com", people)).toEqual([]);
    expect(findMentionedIds("@Emilyn is not her", people)).toEqual([]);
  });
  it("counts each person once and handles punctuation after the tag", () => {
    expect(findMentionedIds("@Emily, @emily! and @Emily's file", people)).toEqual(["e"]);
  });
  it("finds nothing when nobody is tagged", () => {
    expect(findMentionedIds("no tags here", people)).toEqual([]);
  });
});

describe("splitMentions", () => {
  it("cuts the text around each tag", () => {
    expect(splitMentions("hi @Emily, thanks", people)).toEqual([
      { text: "hi " },
      { text: "@Emily", mentionId: "e" },
      { text: ", thanks" },
    ]);
  });
});

describe("activeMentionQuery", () => {
  it("sees a tag being typed at the cursor", () => {
    expect(activeMentionQuery("hi @em", 6)).toEqual({ start: 3, query: "em" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });
  it("ignores an @ inside a word or after the cursor has moved on", () => {
    expect(activeMentionQuery("mail me@x", 9)).toBeNull();
    expect(activeMentionQuery("hi @Emily and then", 18)).toBeNull();
  });
});

describe("matchMentionPeople", () => {
  it("matches the start of any part of the name", () => {
    expect(matchMentionPeople(people, "st").map((p) => p.id)).toEqual(["e"]);
    expect(matchMentionPeople(people, "an").map((p) => p.id)).toEqual(["a1", "a2"]);
    expect(matchMentionPeople(people, "").length).toBe(4);
  });
});
