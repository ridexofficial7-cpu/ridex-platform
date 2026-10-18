import { ApiError } from "./api";

export type RequestFailureKind = "denied" | "session" | "timeout" | "offline" | "server" | "failure";
export type RequestFailureState = { kind: RequestFailureKind; message: string; recovery: string };

/** Converts transport/API failures into safe, actionable UI state without exposing backend details. */
export function requestFailureState(error: unknown): RequestFailureState {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: "session", message: "Your session is no longer valid.", recovery: "Sign in again, then reopen this workspace." };
    if (error.status === 403) return { kind: "denied", message: "Your current role or geographic scope does not permit this request.", recovery: "Return to an authorized workspace or ask an authorized administrator to review access." };
    if (error.status === 408 || error.status === 504) return { kind: "timeout", message: "The server did not respond before the request timed out.", recovery: "Refresh to retrieve the authoritative state before retrying any action." };
    if (error.status >= 500) return { kind: "server", message: "The RideX service could not complete this request.", recovery: "Refresh after service availability is restored. Do not assume a write succeeded without confirmation." };
    if (error.status === 0) return { kind: "offline", message: "RideX could not be reached.", recovery: "Check the configured API connection, then refresh when connectivity returns." };
  }
  if (error instanceof Error && (error.name === "AbortError" || /timed? ?out|timeout/i.test(error.message))) {
    return { kind: "timeout", message: "The request timed out.", recovery: "Refresh to retrieve the authoritative state before retrying any action." };
  }
  if (error instanceof TypeError || (error instanceof Error && /network|fetch failed|failed to fetch|load failed/i.test(error.message))) {
    return { kind: "offline", message: "RideX could not be reached because the network request failed.", recovery: "Check connectivity and the configured API address, then refresh." };
  }
  return { kind: "failure", message: "The request could not be completed.", recovery: "Refresh to retrieve the authoritative state. If this repeats, contact an administrator." };
}
