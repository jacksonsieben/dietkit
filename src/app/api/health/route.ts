import { NextResponse } from "next/server";

/**
 * Health check. Deliberately dynamic so a green response proves the deployed
 * function actually ran, rather than a build-time snapshot being replayed.
 *
 * Returns no personal data because the server holds none — see docs/DECISIONS.md § D1.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "dietkit",
      time: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      environment: process.env.VERCEL_ENV ?? "development",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
