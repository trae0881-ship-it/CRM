import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

export function ProtectedRoute({ session, children, allowAnonymous = false }: { session: Session | null; children: ReactNode; allowAnonymous?: boolean }) {
  return session || allowAnonymous ? <>{children}</> : null;
}
