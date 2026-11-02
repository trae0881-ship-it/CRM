export type AssignmentCandidate = { userId: string; active: boolean; currentLoad: number; lastAssignedAt: string | null; teamIds: string[] };
export type AssignmentRule = { mode: "round_robin" | "workload" | "team" | "source" | "location" | "campaign"; source?: string; city?: string; campaignId?: string; teamId?: string; };

export function chooseAssignment(candidates: AssignmentCandidate[], rule: AssignmentRule, now = new Date()): string | null {
  const eligible = candidates.filter((candidate) => candidate.active && (!rule.teamId || candidate.teamIds.includes(rule.teamId)));
  if (!eligible.length) return null;
  if (rule.mode === "workload") return [...eligible].sort((a, b) => a.currentLoad - b.currentLoad || a.userId.localeCompare(b.userId))[0].userId;
  if (rule.mode === "round_robin") {
    return [...eligible].sort((a, b) => {
      const aTime = a.lastAssignedAt ? Date.parse(a.lastAssignedAt) : 0;
      const bTime = b.lastAssignedAt ? Date.parse(b.lastAssignedAt) : 0;
      return aTime - bTime || a.userId.localeCompare(b.userId);
    })[0].userId;
  }
  return eligible.sort((a, b) => a.currentLoad - b.currentLoad || a.userId.localeCompare(b.userId))[0].userId;
}

export type ScoreInput = { sourceWeight: number; budgetWeight: number; interestWeight: number; responseWeight: number; callWeight: number; followUpWeight: number; visitWeight: number; engagementWeight: number; recencyWeight: number; };
export type ScoreBreakdown = { factor: string; points: number; explanation: string };

export function calculateLeadScore(input: ScoreInput, signals: Record<string, number>, now = new Date()): { score: number; category: "hot" | "warm" | "cold" | "unqualified"; breakdown: ScoreBreakdown[] } {
  const factors: Array<[keyof ScoreInput, string, string]> = [
    ["sourceWeight", "source", "Lead source fit"], ["budgetWeight", "budget", "Customer budget"], ["interestWeight", "interest", "Customer interest"],
    ["responseWeight", "response", "Customer response"], ["callWeight", "call", "Call outcome"], ["followUpWeight", "followUp", "Follow-up completion"],
    ["visitWeight", "visit", "Site visit attendance"], ["engagementWeight", "engagement", "Customer engagement"], ["recencyWeight", "recency", "Time since last interaction"],
  ];
  const breakdown = factors.map(([weight, key, explanation]) => ({ factor: key, points: Math.round((signals[key] || 0) * input[weight]), explanation }));
  const score = Math.max(0, Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0)));
  const category = score >= 75 ? "hot" : score >= 45 ? "warm" : score >= 20 ? "cold" : "unqualified";
  return { score, category, breakdown };
}

export const workflowEventTypes = ["lead_created", "lead_assigned", "lead_status_changed", "lead_score_changed", "follow_up_due", "follow_up_overdue", "site_visit_scheduled", "site_visit_completed", "booking_created", "payment_recorded"] as const;
export function canExecuteWorkflow(lastExecutionAt: string | null, eventKey: string, executedKeys: Set<string>, now = new Date(), minimumIntervalMs = 60_000) {
  if (executedKeys.has(eventKey)) return false;
  return !lastExecutionAt || now.getTime() - Date.parse(lastExecutionAt) >= minimumIntervalMs;
}
