import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadWorkspaceShell } from "@/lib/rally-app-data";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadWorkspaceShell({ id: session.user.id, name: session.user.name ?? null, email: session.user.email ?? null });
  if (!shell || shell.isGuestRole) redirect("/");

  return <SettingsView currentUser={shell.currentUser} currentUserEmail={shell.currentUserEmail} notificationPrefs={shell.notificationPrefs} />;
}
