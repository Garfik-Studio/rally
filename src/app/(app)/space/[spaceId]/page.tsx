import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadTaskBoard } from "@/lib/rally-app-data";
import { SpaceBoard } from "./space-board";

export default async function SpacePage({ params, searchParams }: { params: Promise<{ spaceId: string }>; searchParams: Promise<{ task?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { spaceId } = await params;
  const { task } = await searchParams;
  const data = await loadTaskBoard({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null }, spaceId);
  if (!data) notFound();

  return <SpaceBoard space={data.space} isGuest={false} taskId={task} />;
}
