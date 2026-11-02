import { supabase } from "../lib/supabase";
export { personalWhatsAppUrl, renderWhatsAppTemplate } from "../lib/whatsapp";

export type MessageStatus = "opened" | "submitted" | "queued" | "sent" | "delivered" | "read" | "failed";
const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function recordWhatsAppOpened(input: { organizationId: string; leadId: string; senderId: string; body: string }) {
  const { data, error } = await requireClient().from("whatsapp_messages").insert({ organization_id: input.organizationId, lead_id: input.leadId, sender_id: input.senderId, body: input.body, status: "opened", provider: "personal_click_to_chat" }).select("*").single();
  if (error) throw error;
  return data;
}
