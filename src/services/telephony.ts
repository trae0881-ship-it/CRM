export type ProviderCallStatus = "queued" | "initiating" | "ringing" | "connected" | "disconnected" | "failed";
export type OutgoingCall = { to: string; leadId: string; callbackUrl: string };
export type ProviderCall = { providerCallId: string; status: ProviderCallStatus };

export interface TelephonyProvider {
  readonly name: string;
  initiateCall(input: OutgoingCall): Promise<ProviderCall>;
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
  parseWebhook(rawBody: string): { providerCallId: string; status: ProviderCallStatus; occurredAt: string };
}

export class UnconfiguredTelephonyProvider implements TelephonyProvider {
  readonly name = "unconfigured";
  async initiateCall(): Promise<ProviderCall> { throw new Error("No telephony provider is configured; use manual calling mode."); }
  async verifyWebhook(): Promise<boolean> { return false; }
  parseWebhook(): never { throw new Error("No telephony provider is configured."); }
}
