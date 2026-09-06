"use client";

import { useState } from "react";
import Link from "next/link";
import type { ManageData, RoleKey } from "@/lib/rally-types";
import { AvatarCircle, CopyButton, MUTED_FG } from "@/app/components/primitives";
import { createInvite, createSpace, revokeInvite, setMemberRole, updateSlackWebhook } from "@/app/actions";

export function ManageOverview({ data, role, currentUserId }: { data: ManageData; role: RoleKey; currentUserId: string }) {
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [slackWebhookInput, setSlackWebhookInput] = useState(data.slackWebhookUrl ?? "");
  const [savingSlack, setSavingSlack] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "GUEST">("MEMBER");
  const [inviteSpaceId, setInviteSpaceId] = useState("");
  const [inviteListId, setInviteListId] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);

  async function handleCreateSpace() {
    const name = newSpaceName.trim();
    if (!name || creatingSpace) return;
    setCreatingSpace(true);
    try {
      await createSpace(name);
      setNewSpaceName("");
    } finally {
      setCreatingSpace(false);
    }
  }

  async function handleSaveSlackWebhook() {
    setSavingSlack(true);
    setSlackError(null);
    try {
      await updateSlackWebhook(slackWebhookInput);
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : "Couldn't save Slack webhook");
    } finally {
      setSavingSlack(false);
    }
  }

  async function handleCreateInvite() {
    const email = inviteEmail.trim();
    if (!email || creatingInvite) return;
    if (inviteRole === "MEMBER" && !inviteSpaceId) return;
    if (inviteRole === "GUEST" && !inviteListId) return;
    setCreatingInvite(true);
    try {
      const result = await createInvite({ email, role: inviteRole, spaceId: inviteRole !== "GUEST" ? inviteSpaceId || undefined : undefined, listId: inviteRole === "GUEST" ? inviteListId : undefined });
      setInviteLink(result?.url ?? null);
      setInviteEmail("");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleSetMemberRole(userId: string, nextRole: "ADMIN" | "MEMBER") {
    setSavingRole(userId);
    try {
      await setMemberRole(userId, nextRole);
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
      {role === "OWNER" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Slack notifications</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={slackWebhookInput} onChange={(e) => setSlackWebhookInput(e.target.value)} placeholder="https://hooks.slack.com/services/..." style={{ flex: 1, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={handleSaveSlackWebhook} disabled={savingSlack} style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: savingSlack ? 0.6 : 1 }}>
              {savingSlack ? "Saving…" : "Save"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: MUTED_FG, margin: 0, lineHeight: 1.5 }}>Paste a Slack incoming webhook URL to mirror task and comment notifications into a channel. Leave blank to turn it off.</p>
          {slackError && <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>{slackError}</div>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Spaces</div>
        <div style={{ fontSize: 12.5, color: MUTED_FG, marginTop: -6 }}>Per-space settings (members, custom fields) live inside each space.</div>
        {role === "OWNER" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateSpace()} placeholder="New space name" style={{ flex: 1, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={handleCreateSpace} disabled={!newSpaceName.trim() || creatingSpace} style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: !newSpaceName.trim() || creatingSpace ? 0.5 : 1 }}>
              Create
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.spaces.map((sp) => (
            <div key={sp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>{sp.name.charAt(0)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{sp.name}</div>
                <div style={{ fontSize: 11.5, color: MUTED_FG }}>{sp.memberCount} members &middot; {sp.taskCount} tasks</div>
              </div>
              <Link href={`/manage/${sp.id}`} style={{ border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, color: "oklch(0.35 0.01 60)", textDecoration: "none" }}>
                Manage
              </Link>
            </div>
          ))}
        </div>
      </div>

      {role === "OWNER" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>People</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.allMembers.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: "8px 12px" }}>
                <AvatarCircle avatar={m} size={24} fontSize={10} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                {m.role === "OWNER" || m.id === currentUserId ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "oklch(0.5 0.01 60)", textTransform: "capitalize" }}>{m.role.toLowerCase()}</span>
                ) : (
                  <select value={m.role} onChange={(e) => handleSetMemberRole(m.id, e.target.value as "ADMIN" | "MEMBER")} disabled={savingRole === m.id} style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Invite someone</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: 12 }}>
          <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="email@company.com" style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={inviteRole}
              onChange={(e) => {
                setInviteRole(e.target.value as typeof inviteRole);
                setInviteSpaceId("");
                setInviteListId("");
              }}
              style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
            >
              {role === "OWNER" && <option value="ADMIN">Admin</option>}
              <option value="MEMBER">Member</option>
              <option value="GUEST">Guest</option>
            </select>
            {inviteRole === "MEMBER" && (
              <select value={inviteSpaceId} onChange={(e) => setInviteSpaceId(e.target.value)} style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}>
                <option value="">Which space?</option>
                {data.spaces.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            )}
            {inviteRole === "ADMIN" && role === "OWNER" && (
              <select value={inviteSpaceId} onChange={(e) => setInviteSpaceId(e.target.value)} style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}>
                <option value="">Which space? (optional, assign later)</option>
                {data.spaces.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            )}
            {inviteRole === "GUEST" && (
              <select value={inviteListId} onChange={(e) => setInviteListId(e.target.value)} style={{ flex: 1, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}>
                <option value="">Which list?</option>
                {data.allLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={handleCreateInvite}
            disabled={!inviteEmail.trim() || creatingInvite || (inviteRole === "MEMBER" && !inviteSpaceId) || (inviteRole === "GUEST" && !inviteListId)}
            style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: !inviteEmail.trim() || creatingInvite ? 0.5 : 1 }}
          >
            Send invite
          </button>
          {inviteLink && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "oklch(0.96 0.006 60)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 12, color: "oklch(0.4 0.01 60)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteLink}</div>
              <CopyButton text={inviteLink} style={{ height: "auto", padding: "4px 10px", border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12 }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Pending invites</div>
        {data.pendingInvites.length === 0 ? (
          <div style={{ fontSize: 13, color: "oklch(0.55 0.01 60)" }}>No pending invites.</div>
        ) : (
          data.pendingInvites.map((inv) => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid oklch(0.9 0.006 60)", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
                <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{inv.role.toLowerCase()}{inv.scope ? ` · ${inv.scope}` : ""}</div>
              </div>
              <CopyButton text={inv.url} style={{ height: "auto", padding: "4px 10px", border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontSize: 12 }} />
              <button onClick={() => revokeInvite(inv.id)} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent", color: "oklch(0.5 0.15 25)", cursor: "pointer" }}>
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
