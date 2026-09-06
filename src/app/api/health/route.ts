import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Point an uptime pinger (UptimeRobot, Better Stack, etc.) at this.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("Health check failed", err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
