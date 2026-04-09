import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_BETA_STATUS_COOKIE,
  AUTH_E2E_COOKIE,
  AUTH_E2E_EMAIL_COOKIE,
  isAdminEmail,
  isE2EServerAuthAllowed,
  normalizeNextPath,
  validateSupabaseAccessToken,
} from "./lib/authGate";

const LOGIN_PATH = "/login";
const DASHBOARD_PATH = "/dashboard";

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(AUTH_ACCESS_COOKIE);
  response.cookies.delete(AUTH_BETA_STATUS_COOKIE);
  response.cookies.delete(AUTH_E2E_COOKIE);
  response.cookies.delete(AUTH_E2E_EMAIL_COOKIE);
  return response;
}

function buildDashboardRedirect(request: NextRequest) {
  const dashboardUrl = request.nextUrl.clone();
  dashboardUrl.pathname = DASHBOARD_PATH;
  dashboardUrl.search = "";
  return NextResponse.redirect(dashboardUrl);
}

function buildAuthenticatedRedirect(request: NextRequest) {
  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next"));
  const nextUrl = new URL(nextPath, request.url);
  return NextResponse.redirect(nextUrl);
}

async function resolveAuthState(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const e2eAllowed = isE2EServerAuthAllowed(hostname);
  const e2eEnabled = request.cookies.get(AUTH_E2E_COOKIE)?.value === "1";
  const e2eEmail = String(request.cookies.get(AUTH_E2E_EMAIL_COOKIE)?.value || "").trim().toLowerCase();

  if (e2eAllowed && e2eEnabled && e2eEmail) {
    return {
      authenticated: true,
      email: e2eEmail,
      betaStatus: "approved",
      e2e: true,
    };
  }

  const accessToken = String(request.cookies.get(AUTH_ACCESS_COOKIE)?.value || "").trim();
  if (!accessToken) {
    return {
      authenticated: false,
      email: null,
      betaStatus: null,
      e2e: false,
    };
  }

  const user = await validateSupabaseAccessToken(accessToken);
  if (!user?.id) {
    return {
      authenticated: false,
      email: null,
      betaStatus: null,
      e2e: false,
      invalidToken: true,
    };
  }

  return {
    authenticated: true,
    email: user.email,
    betaStatus: String(request.cookies.get(AUTH_BETA_STATUS_COOKIE)?.value || "").trim().toLowerCase() || null,
    e2e: false,
  };
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const authState = await resolveAuthState(request);
  const isLoginRoute = pathname === LOGIN_PATH;
  const isAdminRoute = pathname.startsWith("/admin");
  const isDashboardRoute = pathname.startsWith(DASHBOARD_PATH);

  if (!authState.authenticated) {
    if (isLoginRoute) {
      const response = NextResponse.next();
      if (authState.invalidToken) {
        response.cookies.delete(AUTH_ACCESS_COOKIE);
        response.cookies.delete(AUTH_BETA_STATUS_COOKIE);
        response.cookies.delete(AUTH_E2E_COOKIE);
        response.cookies.delete(AUTH_E2E_EMAIL_COOKIE);
      }
      return response;
    }
    return buildLoginRedirect(request);
  }

  if (isAdminRoute && !isAdminEmail(authState.email)) {
    return buildDashboardRedirect(request);
  }

  if (!isAdminRoute && !isDashboardRoute) {
    const betaApproved = authState.betaStatus === "approved";
    if (!betaApproved) {
      return buildDashboardRedirect(request);
    }
  }

  if (isLoginRoute) {
    return buildAuthenticatedRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/creators/:path*",
    "/projects/:path*",
    "/credits/:path*",
    "/support/:path*",
    "/plans/:path*",
    "/editor/:path*",
    "/admin/:path*",
  ],
};
