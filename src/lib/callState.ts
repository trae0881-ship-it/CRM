export type CallState = "queued" | "initiating" | "ringing" | "connected" | "disconnected" | "failed";
const transitions: Record<CallState, CallState[]> = {
  queued: ["initiating", "failed"],
  initiating: ["ringing", "connected", "failed"],
  ringing: ["connected", "disconnected", "failed"],
  connected: ["disconnected", "failed"],
  disconnected: [],
  failed: [],
};

export function canTransitionCall(from: CallState, to: CallState) {
  return transitions[from].includes(to);
}

export function advanceCall(from: CallState, to: CallState) {
  if (!canTransitionCall(from, to)) throw new Error(`Invalid call transition: ${from} -> ${to}`);
  return to;
}

export function callDurationSeconds(startedAt: string, endedAt: string) {
  return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
}
