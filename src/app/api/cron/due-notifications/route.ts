import { NextRequest, NextResponse } from "next/server";
import { checkDueDateNotifications } from "@/app/actions";

// Vercel Cron fires this once daily at 08:00 UTC (see vercel.json — Hobby
// plan only allows daily crons). DUE_NOTIFY_HOUR must match that schedule
// hour; if you change one, change the other.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetHour = Number(process.env.DUE_NOTIFY_HOUR ?? 8);
  const currentHour = new Date().getUTCHours();
  if (currentHour !== targetHour) {
    return NextResponse.json({ skipped: true, currentHour, targetHour });
  }

  await checkDueDateNotifications();
  return NextResponse.json({ ok: true });
}
