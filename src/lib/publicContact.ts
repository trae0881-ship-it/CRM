export const ADOMETA_WHATSAPP_NUMBER = "919161533353";
export const ADOMETA_WHATSAPP_DISPLAY = "+91 91615 33353";

export type PublicContactSubmission = {
  fullName: string;
  mobile: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
};

export function validatePublicContact(input: PublicContactSubmission) {
  const email = input.email.trim();
  const mobile = input.mobile.trim().replace(/[\s()-]/g, "");
  return {
    fullName: input.fullName.trim().length >= 2 && input.fullName.trim().length <= 120,
    mobile: /^\+?[1-9]\d{9,14}$/.test(mobile),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
    company: (input.company?.trim().length ?? 0) <= 160,
    subject: input.subject.trim().length >= 2 && input.subject.trim().length <= 160,
    message: input.message.trim().length >= 10 && input.message.trim().length <= 4000,
  };
}

export function createWhatsAppUrl(message: string) {
  return `https://wa.me/${ADOMETA_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function createContactWhatsAppMessage(input: PublicContactSubmission) {
  return [
    "Hello Adometa Team, I have a website enquiry.",
    `Name: ${input.fullName.trim()}`,
    `Mobile: ${input.mobile.trim()}`,
    `Email: ${input.email.trim()}`,
    ...(input.company?.trim() ? [`Company: ${input.company.trim()}`] : []),
    `Subject: ${input.subject.trim()}`,
    `Message: ${input.message.trim()}`,
  ].join("\n");
}

export function createPlanWhatsAppMessage(planName: string, displayedPrice: string) {
  return `Hello Adometa Team, I am interested in the ${planName} plan (${displayedPrice}). Please share the details.`;
}
