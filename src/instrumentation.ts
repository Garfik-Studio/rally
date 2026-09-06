import { PHASE_PRODUCTION_BUILD } from "next/constants";
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
    return;
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await import("./sentry.server.config");
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  const { ensureOwnerBootstrap } = await import("@/lib/bootstrap");
  await ensureOwnerBootstrap().catch((err) => console.error("Owner bootstrap failed:", err));
}

// Captures errors from Server Components, Server Functions, and proxy.
export const onRequestError = Sentry.captureRequestError;
