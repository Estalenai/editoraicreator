import { NextResponse } from "next/server";

/**
 * Placeholder para OAuth callback (se você usar providers sociais depois).
 * Para email/senha, não é necessário.
 */
export async function GET() {
  return NextResponse.redirect(new URL("/dashboard", process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"));
}
