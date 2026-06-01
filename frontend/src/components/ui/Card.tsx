import type { PropsWithChildren } from "react";

export function Card({ children }: PropsWithChildren) {
  return <div className="rounded-card border border-border bg-white p-4 shadow-card">{children}</div>;
}

