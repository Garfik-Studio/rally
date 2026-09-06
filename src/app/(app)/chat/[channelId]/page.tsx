import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadChannel } from "@/lib/rally-app-data";
import { ChatThread } from "./chat-thread";

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { channelId } = await params;
  const channel = await loadChannel({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null }, channelId);
  if (!channel) notFound();

  return <ChatThread key={channel.id} channel={channel} />;
}
