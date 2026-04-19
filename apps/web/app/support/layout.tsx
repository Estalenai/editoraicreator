import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function SupportRouteLayout({ children }: { children: ReactNode }) {
  return children;
}
