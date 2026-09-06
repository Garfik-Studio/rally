"use client";

import { useState } from "react";
import type { UiAvatar } from "@/lib/rally-types";
import { MUTED_FG } from "@/app/components/primitives";
import { PasswordInput, PasswordStrengthMeter } from "@/app/components/password-field";
import { updateNotificationPrefs, updatePassword, updateProfileName } from "@/app/actions";

const NOTIF_PREF_DEFS: { key: string; label: string; group: string }[] = [
  { key: "taskAssigned", label: "Assigned to a task", group: "Tasks" },
  { key: "taskDue", label: "Task due soon", group: "Tasks" },
  { key: "comments", label: "Comments & mentions on tasks", group: "Tasks" },
  { key: "chatMentions", label: "Mentions in chat", group: "Chat" },
  { key: "desktopNotifications", label: "Desktop notifications for new chat messages", group: "Chat" },
];

export function SettingsView({ currentUser, currentUserEmail, notificationPrefs }: { currentUser: UiAvatar; currentUserEmail: string; notificationPrefs: Record<string, boolean> | null }) {
  const [tab, setTab] = useState<"profile" | "notifications">("profile");
  const [profileNameInput, setProfileNameInput] = useState(currentUser.name);
  const [savingProfileName, setSavingProfileName] = useState(false);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Every pref defaults on except desktopNotifications, which is opt-in (it needs a browser
  // permission grant, so silently defaulting it on would be surprising).
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIF_PREF_DEFS.map((d) => [d.key, d.key === "desktopNotifications" ? notificationPrefs?.[d.key] === true : notificationPrefs?.[d.key] !== false]))
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));

  async function handleSaveProfileName() {
    const name = profileNameInput.trim();
    if (!name || savingProfileName) return;
    setSavingProfileName(true);
    try {
      await updateProfileName(name);
    } finally {
      setSavingProfileName(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError("New passwords don't match");
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(currentPasswordInput, newPasswordInput);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setPasswordFormOpen(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Couldn't change password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleToggleNotifPref(key: string) {
    const turningOn = !notifPrefs[key];
    if (key === "desktopNotifications" && turningOn && notifPermission !== "granted" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result !== "granted") return;
    }
    const next = { ...notifPrefs, [key]: turningOn };
    setNotifPrefs(next);
    await updateNotificationPrefs(next);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, maxWidth: 640 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, borderBottom: "1px solid oklch(0.9 0.006 60)" }}>
        <button onClick={() => setTab("profile")} style={{ padding: "8px 4px", border: "none", borderBottom: `2px solid ${tab === "profile" ? "oklch(0.68 0.16 35)" : "transparent"}`, background: "transparent", fontSize: 13, fontWeight: 700, color: tab === "profile" ? "oklch(0.25 0.01 60)" : MUTED_FG, cursor: "pointer" }}>
          Profile
        </button>
        <button onClick={() => setTab("notifications")} style={{ padding: "8px 4px", border: "none", borderBottom: `2px solid ${tab === "notifications" ? "oklch(0.68 0.16 35)" : "transparent"}`, background: "transparent", fontSize: 13, fontWeight: 700, color: tab === "notifications" ? "oklch(0.25 0.01 60)" : MUTED_FG, cursor: "pointer" }}>
          Notifications
        </button>
      </div>
      {tab === "profile" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Name</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} style={{ flex: 1, boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }} />
              {profileNameInput.trim() !== currentUser.name && (
                <button onClick={handleSaveProfileName} disabled={!profileNameInput.trim() || savingProfileName} style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", borderRadius: 8, cursor: "pointer", opacity: !profileNameInput.trim() || savingProfileName ? 0.6 : 1 }}>
                  {savingProfileName ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG, marginBottom: 6 }}>Email</div>
            <div style={{ fontSize: 13.5, color: "oklch(0.4 0.01 60)", padding: "9px 12px", background: "oklch(0.97 0.006 60)", borderRadius: 8 }}>{currentUserEmail}</div>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED_FG }}>Password</div>
              <button
                onClick={() => {
                  setPasswordFormOpen((v) => !v);
                  setPasswordError(null);
                }}
                style={{ border: "none", background: "transparent", color: "oklch(0.5 0.14 240)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
              >
                {passwordFormOpen ? "Cancel" : "Change password"}
              </button>
            </div>
            {passwordFormOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <PasswordInput value={currentPasswordInput} onChange={(e) => setCurrentPasswordInput(e.target.value)} placeholder="Current password" style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }} />
                <PasswordInput value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} placeholder="New password" style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }} />
                <PasswordStrengthMeter password={newPasswordInput} attributes={[currentUser.name, currentUserEmail]} />
                <PasswordInput value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} placeholder="Confirm new password" style={{ boxSizing: "border-box", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, fontFamily: "inherit" }} />
                {passwordError && <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>{passwordError}</div>}
                <button onClick={handleChangePassword} disabled={!currentPasswordInput || !newPasswordInput || savingPassword} style={{ alignSelf: "flex-start", border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer", opacity: !currentPasswordInput || !newPasswordInput || savingPassword ? 0.6 : 1 }}>
                  {savingPassword ? "Updating…" : "Update password"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {["Tasks", "Chat"].map((group) => (
            <div key={group}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{group}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {NOTIF_PREF_DEFS.filter((d) => d.group === group).map((pr) => {
                  const on = notifPrefs[pr.key];
                  return (
                    <div key={pr.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px" }}>
                      <div style={{ fontSize: 13.5, color: "oklch(0.28 0.01 60)" }}>
                        {pr.label}
                        {pr.key === "desktopNotifications" && notifPermission === "denied" && (
                          <div style={{ fontSize: 11, color: "oklch(0.55 0.18 25)", marginTop: 2 }}>Blocked in your browser&apos;s site settings.</div>
                        )}
                      </div>
                      <button onClick={() => handleToggleNotifPref(pr.key)} style={{ width: 40, height: 22, borderRadius: 999, border: "none", background: on ? "oklch(0.68 0.16 35)" : "oklch(0.88 0.006 60)", position: "relative", cursor: "pointer", flex: "none" }}>
                        <div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px oklch(0 0 0 / 0.2)", transition: "left 0.12s" }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
