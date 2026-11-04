import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isConnectionError, isRetryableRead, runReadWithRetry } from "@/server/db/resilient-read";

describe("isRetryableRead", () => {
  it("retries plain selects only", () => {
    expect(isRetryableRead('select "id" from "deals" where "id" = $1')).toBe(true);
    expect(isRetryableRead("  SELECT 1")).toBe(true);
    expect(isRetryableRead('insert into "deals" ("id") values ($1)')).toBe(false);
    expect(isRetryableRead('update "deals" set "stage" = $1')).toBe(false);
    expect(isRetryableRead('delete from "deals"')).toBe(false);
    expect(isRetryableRead("with moved as (delete from a returning *) select * from moved")).toBe(false);
    expect(isRetryableRead('select id from "deals" for update')).toBe(false);
    expect(isRetryableRead("select pg_advisory_xact_lock(1) for no key update")).toBe(false);
  });
});

describe("isConnectionError", () => {
  it("finds the code on the error or on drizzle's wrapped cause", () => {
    expect(isConnectionError(Object.assign(new Error("x"), { code: "CONNECTION_DESTROYED" }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error("Failed query"), { cause: { code: "CONNECTION_CLOSED" } }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error("x"), { code: "23505" }))).toBe(false);
    expect(isConnectionError(new Error("boom"))).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

describe("runReadWithRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the first answer without retrying", async () => {
    const onRetry = vi.fn();
    const attempt = vi.fn().mockResolvedValue("rows");
    await expect(runReadWithRetry(attempt, onRetry, 1000)).resolves.toBe("rows");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("swaps the connection and retries when the first attempt never answers", async () => {
    const onRetry = vi.fn();
    const attempt = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce("rows");
    const result = runReadWithRetry(attempt, onRetry, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe("rows");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries once when the connection is destroyed", async () => {
    const onRetry = vi.fn();
    const destroyed = Object.assign(new Error("write CONNECTION_DESTROYED"), { code: "CONNECTION_DESTROYED" });
    const attempt = vi.fn().mockRejectedValueOnce(destroyed).mockResolvedValueOnce("rows");
    await expect(runReadWithRetry(attempt, onRetry, 1000)).resolves.toBe("rows");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry the query's own errors", async () => {
    const onRetry = vi.fn();
    const syntax = Object.assign(new Error('column "x" does not exist'), { code: "42703" });
    const attempt = vi.fn().mockRejectedValue(syntax);
    await expect(runReadWithRetry(attempt, onRetry, 1000)).rejects.toBe(syntax);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("gives up after one retry", async () => {
    const onRetry = vi.fn();
    const destroyed = Object.assign(new Error("gone"), { code: "CONNECTION_CLOSED" });
    const attempt = vi.fn().mockRejectedValue(destroyed);
    await expect(runReadWithRetry(attempt, onRetry, 1000)).rejects.toBe(destroyed);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
