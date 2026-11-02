import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

export function PublicRoute({ session, children }: { session: Session | null | undefined; children: ReactNode }) {
  return session ? null : <>{children}</>;
}
