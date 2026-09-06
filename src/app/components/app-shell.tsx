"use client";

import { useCallback, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { RoleKey, UiAvatar, UiChannelSummary, UiList, UiNotification, UiSpaceSummary } from "@/lib/rally-types";
import { getOrCreateDirectChannel, markAllNotificationsRead, markChannelRead, markNotificationRead } from "@/app/actions";
import { AvatarCircle } from "./primitives";
import { DesktopNotificationBridge } from "./desktop-notifications";
import { useRealtimeEvents } from "@/lib/realtime/use-realtime";

const ACCENT_BG = "oklch(0.93 0.05 35)";
const ACCENT_FG = "oklch(0.35 0.12 35)";
const NEUTRAL_FG = "oklch(0.4 0.01 60)";
const MUTED_FG = "oklch(0.5 0.01 60)";

type NavKey = "tasks" | "chat" | "manage" | "settings";

function navKeyForPath(pathname: string): NavKey {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/manage")) return "manage";
  if (pathname.startsWith("/settings")) return "settings";
  return "tasks";
}

export function AppShell({
  workspaceName,
  currentUser,
  currentUserEmail,
  isGuestRole,
  role,
  spaces,
  sharedLists,
  channels,
  members,
  notifications,
  notificationPrefs,
  children,
}: {
  workspaceName: string;
  currentUser: UiAvatar;
  currentUserEmail: string;
  isGuestRole: boolean;
  role: RoleKey;
  spaces: UiSpaceSummary[];
  sharedLists: UiList[];
  channels: UiChannelSummary[];
  members: UiAvatar[];
  notifications: UiNotification[];
  notificationPrefs: Record<string, boolean> | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeNav = navKeyForPath(pathname);
  const activeSpaceId = activeNav === "tasks" ? pathname.match(/^\/space\/([^/]+)/)?.[1] : undefined;
  const activeChannelId = activeNav === "chat" ? pathname.match(/^\/chat\/([^/]+)/)?.[1] : undefined;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatSidebarExpanded, setChatSidebarExpanded] = useState(false);
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const isGuest = isGuestRole;
  const canManage = !isGuest && (role === "OWNER" || role === "ADMIN");

  // Live unread badges: a WS push for a channel the sidebar shows (but isn't currently open)
  // means the count shown here is stale, so refresh this route's server data. This only runs
  // when a message actually arrives — it's event-driven, not a timer poll.
  useRealtimeEvents(
    useCallback(
      (event) => {
        if (event.type === "message" && event.channelId !== activeChannelId) router.refresh();
      },
      [activeChannelId, router]
    )
  );

  async function handleStartDm(userId: string) {
    setShowDmPicker(false);
    setChatError(null);
    try {
      const channelId = await getOrCreateDirectChannel(userId);
      setDrawerOpen(false);
      router.push(`/chat/${channelId}`);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Couldn't start conversation");
    }
  }

  async function handleOpenNotification(n: UiNotification) {
    setNotifOpen(false);
    if (!n.read) await markNotificationRead(n.id);
    if (n.taskId && n.spaceId) router.push(`/space/${n.spaceId}?task=${n.taskId}`);
  }

  const dmCandidates = members.filter((m) => m.id !== currentUser.id);
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const chatItems = channels.map((c) => {
    const active = activeChannelId === c.id;
    return { key: c.id, unread: active ? 0 : c.unread, displayName: c.isDirect ? c.name : "#" + c.name, rowBg: active ? ACCENT_BG : "transparent", rowColor: active ? ACCENT_FG : "oklch(0.3 0.01 60)" };
  });
  const chatPreviewItems = chatSidebarExpanded ? chatItems : chatItems.slice(0, 5);
  const chatHasMore = !chatSidebarExpanded && chatItems.length > 5;

  const spaceRows = spaces.map((sp) => {
    const active = sp.id === activeSpaceId;
    return { ...sp, initial: sp.name.charAt(0), rowBg: active ? ACCENT_BG : "transparent", rowColor: active ? ACCENT_FG : "oklch(0.3 0.01 60)" };
  });

  function sidebarContent(onNavigate: () => void) {
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)", letterSpacing: "0.04em", padding: "0 8px" }}>{workspaceName.toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px 4px" }}>Spaces</div>
          {spaceRows.map((sp) => (
            <div key={sp.id} style={{ display: "flex", alignItems: "center", borderRadius: 8, background: sp.rowBg }}>
              <Link
                href={`/space/${sp.id}`}
                onClick={onNavigate}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, textAlign: "left", flex: 1, minWidth: 0, textDecoration: "none" }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `oklch(0.85 0.08 ${sp.hue})`, color: `oklch(0.3 0.1 ${sp.hue})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>
                  {sp.initial}
                </div>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: sp.rowColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</div>
                  <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.listLabel}</div>
                </div>
              </Link>
              {canManage && (
                <Link
                  href={`/manage/${sp.id}`}
                  onClick={onNavigate}
                  title="Space settings"
                  style={{ flex: "none", width: 24, height: 24, marginRight: 4, borderRadius: 6, color: "oklch(0.55 0.01 60)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
                >
                  &#8942;
                </Link>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Chat</div>
            <button
              onClick={() => setShowDmPicker((v) => !v)}
              title="Start a direct message"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: 700, color: "oklch(0.55 0.01 60)", lineHeight: 1, padding: "0 4px" }}
            >
              +
            </button>
          </div>
          {showDmPicker && (
            <select
              value=""
              onChange={(e) => e.target.value && handleStartDm(e.target.value)}
              style={{ margin: "0 8px 6px", fontSize: 12.5, padding: "6px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}
            >
              <option value="">Message someone&hellip;</option>
              {dmCandidates.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {chatPreviewItems.map((ch) => (
            <Link
              key={ch.key}
              href={`/chat/${ch.key}`}
              onClick={() => {
                markChannelRead(ch.key);
                onNavigate();
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, textAlign: "left", background: ch.rowBg, textDecoration: "none" }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "oklch(0.9 0.006 60)", flex: "none" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: ch.rowColor, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.displayName}</div>
              {ch.unread > 0 && <div style={{ fontSize: 10, fontWeight: 800, background: "oklch(0.68 0.16 35)", color: "#fff", borderRadius: 999, padding: "1px 6px", flex: "none" }}>{ch.unread}</div>}
            </Link>
          ))}
          {chatItems.length === 0 && <div style={{ fontSize: 12, color: MUTED_FG, padding: "0 8px" }}>No conversations yet.</div>}
          {chatHasMore && (
            <button onClick={() => setChatSidebarExpanded(true)} style={{ textAlign: "left", padding: "6px 8px", border: "none", background: "transparent", fontSize: 12, fontWeight: 700, color: "oklch(0.5 0.14 240)", cursor: "pointer" }}>
              View more
            </button>
          )}
          {chatError && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "6px 8px", margin: "4px 8px 0" }}>{chatError}</div>
          )}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", width: "100%", background: "oklch(0.985 0.004 60)", fontFamily: "var(--font-manrope), system-ui, sans-serif", color: "oklch(0.22 0.01 60)", overflow: "hidden", position: "relative" }}>
      {!isGuest && <DesktopNotificationBridge currentUserId={currentUser.id} enabled={notificationPrefs?.desktopNotifications === true} />}

      {/* top bar */}
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid oklch(0.9 0.006 60)", background: "#fff" }}>
        {!isGuest && (
          <button
            className="rl-hamburger-btn"
            onClick={() => setDrawerOpen((v) => !v)}
            style={{ display: "none", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", flexDirection: "column", gap: 3 }}
          >
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
            <div style={{ width: 18, height: 2, background: "oklch(0.3 0.01 60)" }} />
          </button>
        )}
        <Image src="/logo-black.png" alt="Rally" width={2029} height={775} priority style={{ height: "auto", width: 80, flex: "none", maxWidth: 2029, maxHeight: 775 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 6, borderLeft: "1px solid oklch(0.9 0.006 60)", marginLeft: 2, minWidth: 0, overflow: "hidden" }}>
          {!isGuest && (
            <Link href="/" style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.5 0.01 60)", whiteSpace: "nowrap", textDecoration: "none" }}>
              {workspaceName}
            </Link>
          )}
        </div>
        {isGuest && <div style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "oklch(0.9 0.05 35)", color: "oklch(0.4 0.12 35)", flex: "none" }}>GUEST</div>}
        <div style={{ flex: 1 }} />
        {!isGuest && (
          <div style={{ position: "relative", flex: "none" }}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title="Notifications"
              style={{ position: "relative", width: 36, height: 36, borderRadius: 8, border: "none", background: notifOpen ? "oklch(0.95 0.006 60)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ width: 16, height: 16, borderRadius: "50% 50% 8px 8px", border: "2px solid oklch(0.35 0.01 60)" }} />
              {unreadNotifCount > 0 && <div style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%", background: "oklch(0.62 0.19 25)", border: "1.5px solid #fff" }} />}
            </button>
            {notifOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 45 }} onClick={() => setNotifOpen(false)} />
                <div style={{ position: "absolute", top: 44, right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", border: "1px solid oklch(0.9 0.006 60)", borderRadius: 12, boxShadow: "0 12px 32px oklch(0 0 0 / 0.14)", zIndex: 46, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 10px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>Notifications</div>
                    {unreadNotifCount > 0 && (
                      <button onClick={() => markAllNotificationsRead()} style={{ border: "none", background: "transparent", color: "oklch(0.5 0.14 240)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px 8px", textAlign: "center", fontSize: 12.5, color: "oklch(0.55 0.01 60)" }}>You&apos;re all caught up</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleOpenNotification(n)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 8px", borderRadius: 8, cursor: "pointer", background: n.read ? "transparent" : "oklch(0.97 0.006 60)" }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, background: n.read ? "oklch(0.85 0.006 60)" : "oklch(0.68 0.16 35)", flex: "none" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontSize: 13, color: "oklch(0.25 0.01 60)", lineHeight: 1.4 }}>{n.text}</div>
                          <div style={{ fontSize: 11, color: "oklch(0.55 0.01 60)" }}>{n.time}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <div style={{ position: "relative", flex: "none" }}>
          <button onClick={() => setProfileMenuOpen((v) => !v)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <AvatarCircle avatar={currentUser} size={32} fontSize={12} />
            {!isGuest && <div style={{ fontSize: 11, color: "oklch(0.6 0.01 60)" }}>&#9662;</div>}
          </button>
          {profileMenuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 45 }} onClick={() => setProfileMenuOpen(false)} />
              <div style={{ position: "absolute", top: 44, right: 0, width: 220, background: "#fff", border: "1px solid oklch(0.9 0.006 60)", borderRadius: 12, boxShadow: "0 12px 32px oklch(0 0 0 / 0.14)", zIndex: 46, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid oklch(0.93 0.006 60)", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
                  {!isGuest && <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUserEmail}</div>}
                </div>
                {!isGuest && (
                  <Link href="/settings" onClick={() => setProfileMenuOpen(false)} style={{ textAlign: "left", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.28 0.01 60)", textDecoration: "none" }}>
                    Settings
                  </Link>
                )}
                {canManage && (
                  <Link href="/manage" onClick={() => setProfileMenuOpen(false)} style={{ textAlign: "left", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.28 0.01 60)", textDecoration: "none" }}>
                    Admin console
                  </Link>
                )}
                <div style={{ height: 1, background: "oklch(0.93 0.006 60)", margin: "4px 0" }} />
                <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ textAlign: "left", border: "none", background: "transparent", padding: "9px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "oklch(0.55 0.16 25)", cursor: "pointer" }}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* sidebar */}
        <div className="rl-sidebar" style={{ width: 260, flex: "none", flexDirection: "column", borderRight: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", padding: "16px 12px", gap: 18, overflowY: "auto" }}>
          {!isGuest && sidebarContent(() => {})}
          {isGuest && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0 8px" }}>Shared with you</div>
              {sharedLists.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, background: "oklch(0.93 0.05 35)" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "oklch(0.85 0.08 150)", color: "oklch(0.3 0.1 150)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                    {l.name.charAt(0)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.35 0.12 35)" }}>{l.name}</div>
                </div>
              ))}
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "oklch(0.5 0.01 60)", padding: "0 8px", margin: 0 }}>You can view and comment on tasks in this list. Other workspace areas aren&apos;t shared with guests.</p>
            </div>
          )}
        </div>

        {/* main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>{children}</div>
      </div>

      {!isGuest && (
        <div className="rl-bottomnav" style={{ display: "none", flex: "none", height: 60, borderTop: "1px solid oklch(0.9 0.006 60)", background: "#fff", alignItems: "center", justifyContent: "space-around", position: "relative", zIndex: 10 }}>
          <Link href="/" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", color: activeNav === "tasks" ? "oklch(0.68 0.16 35)" : NEUTRAL_FG }}>
            <div style={{ width: 18, height: 18, border: "2px solid currentColor", borderRadius: 4 }} />
            <div style={{ fontSize: 10, fontWeight: 600 }}>Tasks</div>
          </Link>
          <Link href="/chat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", color: activeNav === "chat" ? "oklch(0.68 0.16 35)" : NEUTRAL_FG }}>
            <div style={{ width: 18, height: 16, borderRadius: "5px 5px 5px 1px", border: "2px solid currentColor" }} />
            <div style={{ fontSize: 10, fontWeight: 600 }}>Chat</div>
          </Link>
          <button onClick={() => setDrawerOpen((v) => !v)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", color: "oklch(0.4 0.01 60)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
              <div style={{ width: 16, height: 2, background: "currentColor" }} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>Menu</div>
          </button>
        </div>
      )}

      {!isGuest && drawerOpen && (
        <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.35)", zIndex: 60, display: "flex" }}>
          <div style={{ width: 280, height: "100%", background: "#fff", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <button onClick={() => setDrawerOpen(false)} style={{ border: "none", background: "oklch(0.95 0.006 60)", width: 30, height: 30, borderRadius: 8, fontSize: 16, cursor: "pointer" }}>
                &times;
              </button>
            </div>
            {sidebarContent(() => setDrawerOpen(false))}
          </div>
          <div style={{ flex: 1 }} onClick={() => setDrawerOpen(false)} />
        </div>
      )}
    </div>
  );
}
