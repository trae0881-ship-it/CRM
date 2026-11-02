import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="public-site"><Header /><main>{children}</main><Footer /></div>;
}
