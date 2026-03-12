import { NextResponse } from "next/server";

/**
 * Placeholder para OAuth callback (se você usar providers sociais depois).
 * Para email/senha, não é necessário.
 */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
