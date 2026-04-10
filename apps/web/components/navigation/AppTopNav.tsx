"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { EditorRouteLink } from "../ui/EditorRouteLink";

type NavItem = {
  href: string;
  label: string;
  meta: string;
  group: "overview" | "core" | "support";
  aliases?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", meta: "Visão geral do workspace", group: "overview" },
  { href: "/creators", label: "Creators", meta: "Gerar base criativa com contexto", group: "core" },
  { href: "/editor/new", label: "Editor", meta: "Abrir, revisar e consolidar a peça", group: "core", aliases: ["/editor"] },
  { href: "/projects", label: "Projetos", meta: "Continuidade, saída e registro", group: "core" },
  { href: "/credits", label: "Créditos", meta: "Saldo e histórico financeiro", group: "support" },
  { href: "/plans", label: "Planos", meta: "Assinatura e disponibilidade", group: "support" },
  { href: "/dashboard/account", label: "Conta", meta: "Sessões, preferências e inbox", group: "support" },
  { href: "/support", label: "Suporte", meta: "Ajuda operacional", group: "support" },
  { href: "/how-it-works", label: "Como funciona", meta: "Guia rápido do fluxo", group: "support" },
  { href: "/admin", label: "Admin", meta: "Operação restrita", group: "support" },
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
  const publicStandaloneRoutes = new Set([
    "/",
    "/login",
    "/how-it-works",
    "/termos",
    "/privacidade",
    "/transparencia-ia",
    "/uso-aceitavel",
    "/cancelamento-e-reembolso",
    "/como-operamos",
  ]);
  if (current === "/") return true;
  if (current.startsWith("/login")) return true;
  if (publicStandaloneRoutes.has(current)) return true;
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
  const overviewItems = useMemo(
    () => navItems.filter((item) => item.group === "overview"),
    [navItems]
  );
  const coreItems = useMemo(
    () => navItems.filter((item) => item.group === "core"),
    [navItems]
  );
  const supportItems = useMemo(
    () => navItems.filter((item) => item.group === "support"),
    [navItems]
  );

  function renderNavItem(item: NavItem) {
    const active = matchesNavPath(pathname, item);
    const className = `app-nav-link layout-contract-item layout-contract-rail-link app-nav-link-${item.group}${active ? " app-nav-link-active" : ""}`;
    const content = (
      <>
        <span className="app-nav-link-label">{item.label}</span>
        <span className="app-nav-link-meta">{item.meta}</span>
      </>
    );

    if (item.href.startsWith("/editor")) {
      return (
        <EditorRouteLink
          key={item.href}
          href={item.href}
          className={className}
          aria-current={active ? "page" : undefined}
          data-active={active ? "true" : "false"}
          data-group={item.group}
        >
          {content}
        </EditorRouteLink>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        className={className}
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : "false"}
        data-group={item.group}
      >
        {content}
      </Link>
    );
  }

  function renderCompactNavItem(item: NavItem) {
    const active = matchesNavPath(pathname, item);
    const className = `app-nav-link app-nav-compact-link layout-contract-item layout-contract-rail-link app-nav-link-${item.group}${active ? " app-nav-link-active" : ""}`;

    if (item.href.startsWith("/editor")) {
      return (
        <EditorRouteLink
          key={`${item.href}-compact`}
          href={item.href}
          className={className}
          aria-current={active ? "page" : undefined}
          data-active={active ? "true" : "false"}
          data-group={item.group}
        >
          <span className="app-nav-link-label">{item.label}</span>
        </EditorRouteLink>
      );
    }

    return (
      <Link
        key={`${item.href}-compact`}
        href={item.href}
        prefetch={false}
        className={className}
        aria-current={active ? "page" : undefined}
        data-active={active ? "true" : "false"}
        data-group={item.group}
      >
        <span className="app-nav-link-label">{item.label}</span>
      </Link>
    );
  }

  if (hideNavigation) return null;

  return (
    <nav className="app-top-nav app-nav-rail layout-contract-rail" aria-label="Navegação principal">
      <div className="app-top-nav-head app-nav-rail-head layout-contract-rail-head">
        <p className="app-top-nav-title">Workspace</p>
        <p className="app-top-nav-text">
          Creators, editor e projetos ficam no centro. Operação entra como apoio.
        </p>
        <div className="app-nav-core-strip" aria-label="Fluxo principal do produto">
          <span className="app-nav-core-pill">Creators</span>
          <span className="app-nav-core-pill">Editor</span>
          <span className="app-nav-core-pill">Projetos + saída</span>
        </div>
      </div>
      <div className="app-nav-compact-strip" aria-label="Atalhos do workspace">
        {navItems.map(renderCompactNavItem)}
      </div>
      {overviewItems.length > 0 ? (
        <div className="app-nav-overview">{overviewItems.map(renderNavItem)}</div>
      ) : null}
      <div className="app-nav-group app-nav-group-core">
        <div className="app-nav-group-head">
          <p className="app-nav-group-kicker">Núcleo criativo</p>
          <p className="app-nav-group-text">Geração, edição, continuidade e saída em primeiro plano.</p>
        </div>
        <div className="app-nav-links app-nav-links-core app-nav-rail-links layout-contract-collection">
          {coreItems.map(renderNavItem)}
        </div>
      </div>
      <div className="app-nav-group app-nav-group-support">
        <div className="app-nav-group-head">
          <p className="app-nav-group-kicker">Camada operacional</p>
          <p className="app-nav-group-text">Saldo, plano, suporte e área restrita só entram quando necessários.</p>
        </div>
        <div className="app-nav-links app-nav-links-support app-nav-rail-links layout-contract-collection">
          {supportItems.map(renderNavItem)}
        </div>
      </div>
    </nav>
  );
}
