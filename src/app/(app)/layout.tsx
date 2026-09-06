import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { loadWorkspaceShell } from "@/lib/rally-app-data";
import { AppShell } from "@/app/components/app-shell";
import { RealtimeProvider } from "@/lib/realtime/use-realtime";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadWorkspaceShell({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  if (!shell) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "system-ui, sans-serif" }}>You&apos;re not a member of any workspace yet.</div>;
  }

  return (
    <RealtimeProvider>
      <AppShell
        workspaceName={shell.workspaceName}
        currentUser={shell.currentUser}
        currentUserEmail={shell.currentUserEmail}
        isGuestRole={shell.isGuestRole}
        role={shell.role}
        spaces={shell.spaces}
        sharedLists={shell.sharedLists}
        channels={shell.channels}
        members={shell.members}
        notifications={shell.notifications}
        notificationPrefs={shell.notificationPrefs}
      >
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}
