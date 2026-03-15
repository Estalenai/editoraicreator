"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type NavItem = {
  href: string;
  label: string;
  meta: string;
  match: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", meta: "Conta, saldo e visão executiva", match: (pathname) => pathname === "/dashboard" },
  { href: "/creators", label: "Creators", meta: "Gerar conteúdo com IA", match: (pathname) => pathname === "/creators" },
  { href: "/projects", label: "Projetos", meta: "Continuar no editor", match: (pathname) => pathname === "/projects" || pathname.startsWith("/editor/") },
  { href: "/credits", label: "Créditos", meta: "Saldo, histórico e compra", match: (pathname) => pathname === "/credits" },
  { href: "/plans", label: "Planos", meta: "Assinatura e disponibilidade", match: (pathname) => pathname === "/plans" },
  { href: "/support", label: "Suporte", meta: "Ajuda operacional", match: (pathname) => pathname === "/support" },
  { href: "/how-it-works", label: "Como funciona", meta: "Fluxo, transparência e uso", match: (pathname) => pathname === "/how-it-works" },
  { href: "/admin", label: "Admin", meta: "Operação restrita", match: (pathname) => pathname === "/admin" },
];

function shouldHideNavigation(pathname: string): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/api/")) return true;
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
    () => NAV_ITEMS.filter((item) => item.href !== "/admin" || canAccessAdmin),
    [canAccessAdmin]
  );

  if (hideNavigation) return null;

  return (
    <nav className="app-top-nav" aria-label="Navegação principal">
      <div className="app-top-nav-head">
        <p className="app-top-nav-title">Workspace</p>
        <p className="app-top-nav-text">
          Operacao diaria, creditos e assinatura em uma navegacao unica.
        </p>
      </div>
      <div className="app-nav-links">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-nav-link${active ? " app-nav-link-active" : ""}`}
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
