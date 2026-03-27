"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type NavItem = {
  href: string;
  label: string;
  meta: string;
  aliases?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", meta: "Conta, saldo e visão executiva" },
  { href: "/creators", label: "Creators", meta: "Gerar base para vídeo, foto e conteúdo" },
  { href: "/projects", label: "Projetos", meta: "Editar, salvar e publicar", aliases: ["/editor"] },
  { href: "/credits", label: "Créditos", meta: "Saldo, histórico e compra" },
  { href: "/plans", label: "Planos", meta: "Assinatura, totais e disponibilidade" },
  { href: "/support", label: "Suporte", meta: "Ajuda operacional" },
  { href: "/how-it-works", label: "Como funciona", meta: "Fluxo, transparência e uso" },
  { href: "/admin", label: "Admin", meta: "Operação restrita" },
];

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const normalized = pathname.trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.replace(/\/+$/, "") || "/";
}

function matchesNavPath(pathname: string, item: NavItem): boolean {
  const current = normalizePath(pathname);
  const candidates = [item.href, ...(item.aliases ?? [])].map(normalizePath);

  return candidates.some((candidate) => {
    if (candidate === "/") return current === candidate;
    return current === candidate || current.startsWith(`${candidate}/`);
  });
}

function shouldHideNavigation(pathname: string): boolean {
  if (!pathname) return true;
  const current = normalizePath(pathname);
  if (current === "/") return true;
  if (current.startsWith("/login")) return true;
  if (current.startsWith("/api")) return true;
  return false;
}

export function AppTopNav() {
  const pathname = usePathname() || "";
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const hideNavigation = shouldHideNavigation(pathname);

  useEffect(() => {
    if (hideNavigation) return;
    let cancelled = false;

    async function loadAdminVisibility() {
      try {
        const payload = await api.adminVisibility();
        if (!cancelled) {
          setCanAccessAdmin(Boolean(payload?.is_admin));
        }
      } catch {
        if (!cancelled) {
          setCanAccessAdmin(false);
        }
      }
    }

    loadAdminVisibility();

    return () => {
      cancelled = true;
    };
  }, [hideNavigation]);

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.href !== "/admin") return true;
        return canAccessAdmin || matchesNavPath(pathname, item);
      }),
    [canAccessAdmin, pathname]
  );

  if (hideNavigation) return null;

  return (
    <nav className="app-top-nav app-nav-rail layout-contract-rail" aria-label="Navegação principal">
      <div className="app-top-nav-head app-nav-rail-head layout-contract-rail-head">
        <p className="app-top-nav-title">Workspace</p>
        <p className="app-top-nav-text">
          Creators hero, editor e projetos ficam no centro. Créditos, planos e suporte continuam como camadas operacionais do beta pago/controlado.
        </p>
      </div>
      <div className="app-nav-links app-nav-rail-links layout-contract-collection">
        {navItems.map((item) => {
          const active = matchesNavPath(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-nav-link layout-contract-item layout-contract-rail-link${active ? " app-nav-link-active" : ""}`}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
            >
              <span className="app-nav-link-label">{item.label}</span>
              <span className="app-nav-link-meta">{item.meta}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
