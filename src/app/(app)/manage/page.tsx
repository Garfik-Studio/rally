import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadManageData } from "@/lib/rally-app-data";
import { ManageOverview } from "./manage-overview";

export default async function ManagePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [data, membership] = await Promise.all([
    loadManageData({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null }),
    prisma.userMembership.findFirst({ where: { userId: session.user.id } }),
  ]);
  if (!data || !membership) notFound();

  return <ManageOverview data={data} role={membership.role as "OWNER" | "ADMIN"} currentUserId={session.user.id} />;
}
