"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RouteBoundaryFrame } from "./RouteBoundaryFrame";

type RouteErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
  kicker: string;
  badge: string;
  title: string;
  description: string;
  asideTitle: string;
  asideItems: ReactNode[];
  primaryActionLabel?: string;
  homeHref?: string;
  homeLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  shellClassName?: string;
  contentClassName?: string;
};

export function RouteErrorBoundary({
  error,
  reset,
  kicker,
  badge,
  title,
  description,
  asideTitle,
  asideItems,
  primaryActionLabel = "Tentar novamente",
  homeHref = "/dashboard",
  homeLabel = "Ir para o dashboard",
  secondaryHref = "/",
  secondaryLabel = "Voltar ao início",
  shellClassName = "",
  contentClassName = "",
}: RouteErrorBoundaryProps) {
  const digest = typeof error?.digest === "string" && error.digest.trim() ? error.digest.trim() : null;

  return (
    <RouteBoundaryFrame
      kicker={kicker}
      badge={badge}
      title={title}
      description={description}
      asideTitle={asideTitle}
      asideItems={[
        ...asideItems,
        digest ? (
          <div className="route-boundary-digest">
            <strong>Diagnóstico</strong>
            <code>{digest}</code>
          </div>
        ) : null,
      ].filter(Boolean)}
      actions={
        <>
          <button type="button" className="btn-ea btn-primary" onClick={() => reset()}>
            {primaryActionLabel}
          </button>
          <Link href={homeHref} className="btn-link-ea btn-ghost">
            {homeLabel}
          </Link>
          <Link href={secondaryHref} className="btn-link-ea btn-ghost">
            {secondaryLabel}
          </Link>
        </>
      }
      shellClassName={shellClassName}
      contentClassName={contentClassName}
    />
  );
}
