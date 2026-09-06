import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadWorkspaceShell } from "@/lib/rally-app-data";

export default async function ChatIndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadWorkspaceShell({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  if (shell?.channels[0]) redirect(`/chat/${shell.channels[0].id}`);

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>No conversations yet</div>
        <p style={{ fontSize: 13.5, color: "oklch(0.5 0.01 60)", lineHeight: 1.6 }}>Start one from the &ldquo;+&rdquo; next to Chat in the sidebar.</p>
      </div>
    </div>
  );
}
