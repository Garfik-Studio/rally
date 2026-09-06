import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadWorkspaceShell } from "@/lib/rally-app-data";
import { SpaceBoard } from "./space/[spaceId]/space-board";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadWorkspaceShell({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  if (!shell) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "system-ui, sans-serif" }}>You&apos;re not a member of any workspace yet.</div>;
  }

  if (shell.isGuestRole) {
    const { task } = await searchParams;
    return <SpaceBoard space={{ id: null, name: "Shared with you", members: [], lists: shell.sharedLists }} isGuest taskId={task} />;
  }

  if (shell.spaces[0]) redirect(`/space/${shell.spaces[0].id}`);

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>No spaces yet</div>
        <p style={{ fontSize: 13.5, color: "oklch(0.5 0.01 60)", lineHeight: 1.6 }}>
          {shell.role === "OWNER" ? "Create your first space from the admin console to get started." : "Ask an admin to add you to a space."}
        </p>
      </div>
    </div>
  );
}
