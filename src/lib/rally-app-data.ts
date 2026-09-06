import { cache } from "react";
import type {
  ManageData,
  PriorityKey,
  RoleKey,
  StatusKey,
  UiAvatar,
  UiChannel,
  UiChannelSummary,
  UiCustomField,
  UiInvite,
  UiList,
  UiManageSpace,
  UiMember,
  UiNotification,
  UiSpace,
  UiSpaceSummary,
  TaskBoardData,
  WorkspaceShellData,
} from "@/lib/rally-types";
import { prisma } from "@/lib/prisma";

export const statusByDatabaseValue: Record<string, StatusKey> = { TODO: "todo", IN_PROGRESS: "in_progress", IN_REVIEW: "review", DONE: "done" };
const priorityByDatabaseValue: Record<string, PriorityKey> = { LOW: "low", MEDIUM: "normal", HIGH: "high", URGENT: "urgent" };
const dueFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export const taskInclude = {
  assignees: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  subtasks: { select: { status: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } },
  attachments: { orderBy: { createdAt: "asc" }, include: { uploadedBy: { select: { id: true, name: true, email: true } } } },
  dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
  dependents: { include: { task: { select: { id: true, title: true, status: true } } } },
  checklistItems: { orderBy: { position: "asc" }, select: { id: true, text: true, done: true } },
  customFieldValues: { select: { customFieldId: true, value: true } },
} as const;

export type TaskWithRelations = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignees: { id: string; name: string | null; email: string }[];
  createdBy: { id: string; name: string | null; email: string };
  comments: { id: string; body: string; createdAt: Date; author: { id: string; name: string | null; email: string } }[];
  attachments: { id: string; filename: string; mimeType: string; size: number; createdAt: Date; uploadedBy: { id: string; name: string | null; email: string } }[];
  dependsOn: { dependsOn: { id: string; title: string; status: string } }[];
  dependents: { task: { id: string; title: string; status: string } }[];
  checklistItems: { id: string; text: string; done: boolean }[];
  customFieldValues: { customFieldId: string; value: string }[];
};

export function timeAgo(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function toDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function hueFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return hash % 360;
}

export function toAvatar(user: { id: string; name: string | null; email: string }): UiAvatar {
  const label = user.name ?? user.email;
  const initials = label.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return { id: user.id, name: label, initials, hue: hueFromId(user.id) };
}

export function toUiTask(task: TaskWithRelations) {
  return {
    id: task.id,
    listId: task.listId,
    title: task.title,
    desc: task.description ?? "",
    status: statusByDatabaseValue[task.status] ?? "todo",
    priority: priorityByDatabaseValue[task.priority] ?? "normal",
    due: task.dueDate ? dueFormatter.format(task.dueDate) : "No due date",
    dueDate: toDateString(task.dueDate),
    assignees: task.assignees.map(toAvatar),
    createdBy: toAvatar(task.createdBy),
    checklist: task.checklistItems.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    customFieldValues: task.customFieldValues.map((fieldValue) => ({ fieldId: fieldValue.customFieldId, value: fieldValue.value })),
    comments: task.comments.map((comment) => ({ id: comment.id, author: toAvatar(comment.author), body: comment.body, time: timeAgo(comment.createdAt) })),
    attachments: task.attachments.map((attachment) => ({ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, uploadedBy: toAvatar(attachment.uploadedBy), time: timeAgo(attachment.createdAt) })),
    dependsOn: task.dependsOn.map((dependency) => ({ id: dependency.dependsOn.id, title: dependency.dependsOn.title, status: statusByDatabaseValue[dependency.dependsOn.status] ?? "todo" })),
    dependents: task.dependents.map((dependency) => ({ id: dependency.task.id, title: dependency.task.title, status: statusByDatabaseValue[dependency.task.status] ?? "todo" })),
  };
}

export function toUiCustomField(field: { id: string; name: string; type: string; options: string[] }): UiCustomField {
  return { id: field.id, name: field.name, type: field.type as UiCustomField["type"], options: field.options };
}

type Viewer = { id: string; name: string | null; email: string | null };

/** A workspace member's role + workspaceId, the thing almost every loader below needs first. */
async function requireMembership(userId: string) {
  return prisma.userMembership.findFirst({ where: { userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
}

/**
 * Nav chrome + guest home. Loaded once per request by the (app) layout; cached with React's
 * `cache()` so a page that also calls it (the guest home route) reuses the same DB round trip.
 */
export const loadWorkspaceShell = cache(async (viewer: Viewer): Promise<WorkspaceShellData | null> => {
  const membership = await requireMembership(viewer.id);
  if (!membership) return null;

  const [viewerRecord, notificationsRaw] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewer.id }, select: { name: true, notificationPrefs: true } }),
    prisma.notification.findMany({
      where: { userId: viewer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { task: { select: { listId: true, list: { select: { spaceId: true } } } } },
    }),
  ]);
  // Name comes from the DB, not the (possibly stale) JWT session claim, so it reflects updateProfileName immediately.
  const currentUser = toAvatar({ id: viewer.id, name: viewerRecord?.name ?? viewer.name, email: viewer.email ?? "" });
  const notificationPrefs = (viewerRecord?.notificationPrefs as Record<string, boolean> | null) ?? null;
  const notifications: UiNotification[] = notificationsRaw.map((notification) => ({
    id: notification.id,
    text: notification.text,
    time: timeAgo(notification.createdAt),
    read: notification.readAt !== null,
    taskId: notification.taskId,
    spaceId: notification.task?.list.spaceId ?? null,
  }));

  if (membership.role === "GUEST") {
    const lists = await prisma.list.findMany({
      where: { guestShares: { some: { userId: viewer.id } } },
      include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude }, customFields: { orderBy: { position: "asc" } } },
    });
    const sharedLists: UiList[] = lists.map((list) => ({ id: list.id, name: list.name, isSprint: list.isSprint, sprintStart: toDateString(list.sprintStart), sprintEnd: toDateString(list.sprintEnd), tasks: list.tasks.map(toUiTask), customFields: list.customFields.map(toUiCustomField) }));
    return { workspaceName: membership.workspace.name, currentUser, currentUserEmail: viewer.email ?? "", notificationPrefs, isGuestRole: true, role: "GUEST", spaces: [], sharedLists, members: [], channels: [], notifications };
  }

  const role = membership.role as RoleKey;
  const [membersRaw, channelsRaw, spacesRaw] = await Promise.all([
    prisma.userMembership.findMany({ where: { workspaceId: membership.workspaceId, role: { not: "GUEST" } }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.channel.findMany({
      where: { workspaceId: membership.workspaceId, members: { some: { id: viewer.id } } },
      include: { members: { select: { id: true } }, reads: { where: { userId: viewer.id }, select: { lastReadAt: true } }, _count: { select: { messages: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.space.findMany({
      where: role === "OWNER" ? { workspaceId: membership.workspaceId } : { workspaceId: membership.workspaceId, members: { some: { userId: viewer.id } } },
      include: { lists: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Direct-channel display names need the other member's name, which isn't in the summary query
  // above (kept lean since the sidebar never shows message content). Fetch just those.
  const directOtherIds = channelsRaw.filter((c) => c.isDirect).flatMap((c) => c.members.map((m) => m.id)).filter((id) => id !== viewer.id);
  const directOthers = directOtherIds.length ? await prisma.user.findMany({ where: { id: { in: directOtherIds } }, select: { id: true, name: true, email: true } }) : [];
  const directOtherById = new Map(directOthers.map((u) => [u.id, u]));
  const unreadCounts = await Promise.all(
    channelsRaw.map((c) =>
      prisma.message.count({ where: { channelId: c.id, authorId: { not: viewer.id }, createdAt: { gt: c.reads[0]?.lastReadAt ?? c.createdAt } } })
    )
  );

  const members = membersRaw.map((member) => toAvatar(member.user));
  const channels: UiChannelSummary[] = channelsRaw.map((channel, i) => {
    const otherId = channel.isDirect ? channel.members.find((m) => m.id !== viewer.id)?.id : undefined;
    const other = otherId ? directOtherById.get(otherId) : undefined;
    return { id: channel.id, name: channel.isDirect ? (other ? other.name ?? other.email : "Direct message") : channel.name ?? "channel", isDirect: channel.isDirect, unread: unreadCounts[i] };
  });
  const spaces: UiSpaceSummary[] = spacesRaw.map((space) => ({ id: space.id, name: space.name, hue: hueFromId(space.id), listLabel: space.lists.length === 1 ? "1 list" : `${space.lists.length} lists` }));

  return { workspaceName: membership.workspace.name, currentUser, currentUserEmail: viewer.email ?? "", notificationPrefs, isGuestRole: false, role, spaces, sharedLists: [], members, channels, notifications };
});

async function getSpaceMembersWithOwner(spaceId: string, workspaceId: string) {
  const [space, ownerMembership] = await Promise.all([
    prisma.space.findUnique({ where: { id: spaceId }, include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } }),
    prisma.userMembership.findFirst({ where: { workspaceId, role: "OWNER" }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const membersForSpace = space?.members.map((m) => toAvatar(m.user)) ?? [];
  const ownerAvatar = ownerMembership ? toAvatar(ownerMembership.user) : null;
  return ownerAvatar && !membersForSpace.some((m) => m.id === ownerAvatar.id) ? [ownerAvatar, ...membersForSpace] : membersForSpace;
}

/** Full board data (lists, tasks, custom fields) for one space. Returns null if the space doesn't exist or isn't visible to this user. */
export async function loadTaskBoard(viewer: Viewer, spaceId: string): Promise<TaskBoardData | null> {
  const membership = await requireMembership(viewer.id);
  if (!membership || membership.role === "GUEST") return null;

  const space = await prisma.space.findFirst({
    where: membership.role === "OWNER" ? { id: spaceId, workspaceId: membership.workspaceId } : { id: spaceId, workspaceId: membership.workspaceId, members: { some: { userId: viewer.id } } },
    include: { lists: { include: { tasks: { orderBy: { position: "asc" }, where: { parentId: null }, include: taskInclude }, customFields: { orderBy: { position: "asc" } } } } },
  });
  if (!space) return null;

  const spaceMembers = await getSpaceMembersWithOwner(spaceId, membership.workspaceId);
  const uiSpace: UiSpace = {
    id: space.id,
    name: space.name,
    hue: hueFromId(space.id),
    members: spaceMembers,
    lists: space.lists.map((list) => ({ id: list.id, name: list.name, isSprint: list.isSprint, sprintStart: toDateString(list.sprintStart), sprintEnd: toDateString(list.sprintEnd), tasks: list.tasks.map(toUiTask), customFields: list.customFields.map(toUiCustomField) })),
  };
  return { space: uiSpace };
}

/** One channel's full message history, for the chat page. Returns null if the channel doesn't exist or the viewer isn't a member. */
export async function loadChannel(viewer: Viewer, channelId: string): Promise<UiChannel | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } }, attachments: { include: { uploadedBy: { select: { id: true, name: true, email: true } } } } } },
      members: { select: { id: true, name: true, email: true } },
      reads: { where: { userId: viewer.id }, select: { lastReadAt: true } },
    },
  });
  if (!channel || !channel.members.some((m) => m.id === viewer.id)) return null;

  const otherMember = channel.isDirect ? channel.members.find((member) => member.id !== viewer.id) : undefined;
  const lastReadAt = channel.reads[0]?.lastReadAt ?? channel.createdAt;
  return {
    id: channel.id,
    name: channel.isDirect ? (otherMember ? otherMember.name ?? otherMember.email : "Direct message") : channel.name ?? "channel",
    isDirect: channel.isDirect,
    unread: channel.messages.filter((message) => message.authorId !== viewer.id && message.createdAt > lastReadAt).length,
    members: channel.members.map(toAvatar),
    messages: channel.messages.map((message) => {
      const attachment = message.attachments[0];
      return {
        id: message.id,
        author: toAvatar(message.author),
        text: message.body,
        time: timeFormatter.format(message.createdAt),
        parentMessageId: message.parentMessageId,
        attachment: attachment ? { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, uploadedBy: toAvatar(attachment.uploadedBy), time: timeAgo(attachment.createdAt) } : null,
      };
    }),
  };
}

/** Admin console data: every space's members/custom fields (no task bodies), pending invites, workspace people. */
export async function loadManageData(viewer: Viewer): Promise<ManageData | null> {
  const membership = await requireMembership(viewer.id);
  if (!membership || membership.role === "GUEST" || membership.role === "MEMBER") return null;
  const role = membership.role as RoleKey;

  const [membersRaw, spacesRaw, invitesRaw, ownerMembership] = await Promise.all([
    prisma.userMembership.findMany({ where: { workspaceId: membership.workspaceId, role: { not: "GUEST" } }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.space.findMany({
      where: role === "OWNER" ? { workspaceId: membership.workspaceId } : { workspaceId: membership.workspaceId, members: { some: { userId: viewer.id } } },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } }, lists: { include: { customFields: { orderBy: { position: "asc" } }, _count: { select: { tasks: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({ where: role === "OWNER" ? { workspaceId: membership.workspaceId, acceptedAt: null } : { workspaceId: membership.workspaceId, acceptedAt: null, invitedById: viewer.id }, include: { space: { select: { name: true } }, list: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.userMembership.findFirst({ where: { workspaceId: membership.workspaceId, role: "OWNER" }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);

  const ownerAvatar = ownerMembership ? toAvatar(ownerMembership.user) : null;
  const allMembers: UiMember[] = membersRaw.map((member) => ({ ...toAvatar(member.user), role: member.role as RoleKey }));
  const spaces: UiManageSpace[] = spacesRaw.map((space) => {
    const membersForSpace = space.members.map((m) => toAvatar(m.user));
    const withOwner = ownerAvatar && !membersForSpace.some((m) => m.id === ownerAvatar.id) ? [ownerAvatar, ...membersForSpace] : membersForSpace;
    return {
      id: space.id,
      name: space.name,
      hue: hueFromId(space.id),
      members: withOwner,
      memberCount: withOwner.length,
      taskCount: space.lists.reduce((sum, l) => sum + l._count.tasks, 0),
      lists: space.lists.map((list) => ({ id: list.id, name: list.name, customFields: list.customFields.map(toUiCustomField) })),
    };
  });
  const pendingInvites: UiInvite[] = invitesRaw.map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, scope: invite.space?.name ?? invite.list?.name ?? null, url: `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${invite.token}` }));
  const allLists = spacesRaw.flatMap((sp) => sp.lists.map((l) => ({ id: l.id, label: `${sp.name} / ${l.name}` })));

  const workspace = await prisma.workspace.findUnique({ where: { id: membership.workspaceId }, select: { slackWebhookUrl: true } });
  return { spaces, allMembers, pendingInvites, allLists, slackWebhookUrl: role === "OWNER" ? workspace?.slackWebhookUrl ?? null : null };
}
