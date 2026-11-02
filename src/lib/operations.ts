export type VisitStatus = "scheduled" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "no_show";
export type BookingStatus = "pending" | "confirmed" | "payment_pending" | "partially_paid" | "completed" | "cancelled" | "refunded" | "booked";
export type FollowUpStatus = "open" | "completed" | "cancelled";

export function bookingPendingAmount(value: number, paymentAmount: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(paymentAmount) || paymentAmount < 0) {
    throw new Error("Booking amounts must be non-negative numbers.");
  }
  if (paymentAmount > value) throw new Error("Payment amount cannot exceed booking amount.");
  return Math.round((value - paymentAmount) * 100) / 100;
}

export function validateVisitTransition(current: VisitStatus, next: VisitStatus) {
  const allowed: Record<VisitStatus, VisitStatus[]> = {
    scheduled: ["confirmed", "rescheduled", "completed", "cancelled", "no_show"],
    confirmed: ["rescheduled", "completed", "cancelled", "no_show"],
    rescheduled: ["confirmed", "rescheduled", "completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    no_show: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`Cannot change a ${current} visit to ${next}.`);
}

export function filterDateRange(date: string, range: "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "previous_month" | "all", now = new Date()) {
  if (range === "all") return true;
  const value = new Date(date);
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (range === "today") return value >= start && value <= end;
  if (range === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    return value >= start && value <= end;
  }
  if (range === "last_7_days") start.setDate(start.getDate() - 6);
  if (range === "last_30_days") start.setDate(start.getDate() - 29);
  if (range === "this_month") start.setDate(1);
  if (range === "previous_month") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setMonth(end.getMonth(), 0);
  }
  return value >= start && value <= end;
}
