import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadManageData } from "@/lib/rally-app-data";
import { ManageSpace } from "./manage-space";

export default async function ManageSpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { spaceId } = await params;
  const data = await loadManageData({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  const space = data?.spaces.find((s) => s.id === spaceId);
  if (!data || !space) notFound();

  return <ManageSpace space={space} allMembers={data.allMembers} currentUserId={session.user.id} />;
}
