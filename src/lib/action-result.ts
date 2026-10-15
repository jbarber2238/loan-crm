// Production builds hide the message of anything a server action throws, so
// expected problems (bad input, "already paid") are returned, not thrown.
export type ActionError = { error: string };

export const fail = (error: string): ActionError => ({ error });

export function isActionError(value: unknown): value is ActionError {
  return typeof value === "object" && value !== null && typeof (value as { error?: unknown }).error === "string";
}
