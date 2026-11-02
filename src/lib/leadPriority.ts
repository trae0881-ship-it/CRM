export type QueueLead = {
  id: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: string;
  nextFollowUpAt: string | null;
  createdAt: string;
  lastSuccessfulContactAt: string | null;
  siteVisitAt: string | null;
  bookingStatus: string | null;
};

export type PriorityResult = { level: "P1" | "P2" | "P3" | "P4"; score: number; reason: string };

export function calculateLeadPriority(lead: QueueLead, now = new Date()): PriorityResult {
  const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;
  const nowMs = now.getTime();
  if (due < nowMs) return { level: "P1", score: 100, reason: "Overdue follow-up" };
  if (due <= nowMs + 60 * 60 * 1000) return { level: "P1", score: 95, reason: "Follow-up due now" };
  if (lead.status === "follow_up" || lead.status === "call_back_required") return { level: "P2", score: 80, reason: "Customer requested a follow-up" };
  if (lead.bookingStatus === "booked" || lead.siteVisitAt) return { level: "P2", score: 75, reason: "Booking or site visit urgency" };
  if (lead.priority === "urgent" || lead.priority === "high") return { level: "P2", score: lead.priority === "urgent" ? 74 : 65, reason: "Manager-assigned priority" };
  if (new Date(lead.createdAt).getTime() >= nowMs - 24 * 60 * 60 * 1000) return { level: "P3", score: 55, reason: "Recent inbound lead" };
  if (!lead.lastSuccessfulContactAt) return { level: "P3", score: 45, reason: "No successful contact recorded" };
  return { level: "P4", score: 25, reason: "Routine follow-up" };
}

export function orderCallingQueue(leads: QueueLead[], now = new Date()) {
  return [...leads].sort((a, b) => {
    const left = calculateLeadPriority(a, now);
    const right = calculateLeadPriority(b, now);
    return right.score - left.score || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
