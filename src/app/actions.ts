"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { requireEditableTask, requireListAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { mentionedUserIds } from "@/lib/mentions";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_TASK_ATTACHMENTS_BYTES, deleteAttachmentFile, saveAttachmentFile } from "@/lib/storage";
import { validatePassword } from "@/lib/password-policy";
import { logAudit } from "@/lib/audit";
import { toAvatar, timeFormatter, timeAgo, statusByDatabaseValue } from "@/lib/rally-app-data";
import { broadcastToUsers } from "@/lib/realtime/broadcast";
import type { StatusKey, UiMessage } from "@/lib/rally-types";
import {
  addChecklistItem as addChecklistItemOperation,
  addTaskAssignee as addTaskAssigneeOperation,
  addTaskDependency as addTaskDependencyOperation,
  createTask as createTaskOperation,
  createAttachment as createAttachmentOperation,
  createCustomField as createCustomFieldOperation,
  deleteAttachment as deleteAttachmentOperation,
  deleteChecklistItem as deleteChecklistItemOperation,
  deleteCustomField as deleteCustomFieldOperation,
  deleteTask as deleteTaskOperation,
  moveTaskToList as moveTaskToListOperation,
  removeTaskAssignee as removeTaskAssigneeOperation,
  removeTaskDependency as removeTaskDependencyOperation,
  setCustomFieldValue as setCustomFieldValueOperation,
  toggleChecklistItem as toggleChecklistItemOperation,
  type CustomFieldTypeInput,
  updateTaskDescription as updateTaskDescriptionOperation,
  updateTaskDueDate as updateTaskDueDateOperation,
  updateTaskPriority as updateTaskPriorityOperation,
  updateTaskStatus as updateTaskStatusOperation,
  updateTaskTitle as updateTaskTitleOperation,
  type TaskPriorityInput,
  type TaskStatusInput,
} from "@/lib/tasks";

async function myMembership(userId: string) {
  return prisma.userMembership.findFirst({ where: { userId } });
}

type NotifCategory = "taskAssigned" | "taskDue" | "comments" | "chatMentions";

async function notify(userId: string, actorId: string | null, text: string, taskId?: string, category?: NotifCategory) {
  if (actorId && userId === actorId) return;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, notificationPrefs: true } });
  if (!user) return;
  const prefs = user.notificationPrefs as Record<string, boolean> | null;
  const enabled = !category || !prefs || prefs[category] !== false;

  if (enabled) {
    await prisma.notification.create({ data: { userId, text, taskId } });
    try {
      await sendMail(user.email, "Rally notification", {
        heading: "You have a new notification",
        paragraphs: [text],
        cta: { label: "Open Rally", url: process.env.APP_URL ?? "http://localhost:3000" },
      });
    } catch (err) {
      console.error("Failed to send notification email", err);
    }
  }

  // ponytail: incoming webhooks post to one fixed Slack channel, so this is
  // a broadcast model (everyone in that channel sees every notification),
  // not a per-user DM. Prefix the recipient's name so it's still legible.
  const membership = await myMembership(userId);
  const workspace = membership ? await prisma.workspace.findUnique({ where: { id: membership.workspaceId }, select: { slackWebhookUrl: true } }) : null;
  if (workspace?.slackWebhookUrl) {
    try {
      const res = await fetch(workspace.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${user.name ?? user.email}: ${text}` }),
      });
      if (!res.ok) console.error("Slack webhook rejected notification", res.status, await res.text());
    } catch (err) {
      console.error("Failed to send Slack notification", err);
    }
  }
}

// Called hourly by /api/cron/due-notifications, which only lets it run through
// once at the DUE_NOTIFY_HOUR gate (see that route) — the createdAt check below
// is a cheap belt-and-suspenders dedupe, not the primary guard.
export async function checkDueDateNotifications() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const dayAfterStart = new Date(tomorrowStart.getTime() + 86_400_000);

  const windows = [
    { label: "due today", gte: todayStart, lt: tomorrowStart },
    { label: "due tomorrow", gte: tomorrowStart, lt: dayAfterStart },
  ];

  for (const { label, gte, lt } of windows) {
    const tasks = await prisma.task.findMany({
      where: { dueDate: { gte, lt }, status: { not: "DONE" } },
      include: { assignees: { select: { id: true } } },
    });
    for (const task of tasks) {
      const text = `'${task.title}' is ${label}`;
      for (const assignee of task.assignees) {
        const alreadySent = await prisma.notification.findFirst({
          where: { userId: assignee.id, taskId: task.id, text, createdAt: { gte: todayStart } },
        });
        if (!alreadySent) await notify(assignee.id, null, text, task.id, "taskDue");
      }
    }
  }
}

async function filterWorkspaceMembers(workspaceId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.userMembership.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function assertListAccess(userId: string, listId: string) {
  return requireListAccess(userId, listId);
}

export async function createTask(listId: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await createTaskOperation(session.user.id, listId, title);
  revalidatePath("/", "layout");
}

export async function createSpace(name: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can create spaces");

  await prisma.space.create({ data: { workspaceId: membership.workspaceId, name: trimmed } });
  revalidatePath("/", "layout");
}

export async function assertManagesSpace(userId: string, membershipRole: string, spaceId: string) {
  if (membershipRole === "OWNER") return;
  if (membershipRole !== "ADMIN") throw new Error("Forbidden");
  const isSpaceAdmin = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  if (!isSpaceAdmin) throw new Error("You don't manage this space");
}

export async function assertSpaceAccess(userId: string, membershipRole: string, spaceId: string) {
  if (membershipRole === "OWNER") return;
  const isSpaceMember = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
  if (!isSpaceMember) throw new Error("Forbidden");
}

export async function createList(spaceId: string, name: string, isSprint: boolean, sprintStart?: string, sprintEnd?: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertSpaceAccess(session.user.id, membership.role, spaceId);

  await prisma.list.create({
    data: {
      spaceId,
      name: trimmed,
      isSprint,
      sprintStart: isSprint && sprintStart ? new Date(sprintStart) : null,
      sprintEnd: isSprint && sprintEnd ? new Date(sprintEnd) : null,
    },
  });
  revalidatePath("/", "layout");
}

export async function setMemberRole(userId: string, role: "ADMIN" | "MEMBER") {
  const session = await auth();
  if (!session?.user?.id) return;
  if (userId === session.user.id) throw new Error("You can't change your own role");

  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can change roles");

  const target = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: membership.workspaceId } },
  });
  if (!target || target.role === "OWNER" || target.role === "GUEST") throw new Error("Can't change this user's role");

  await prisma.userMembership.update({ where: { id: target.id }, data: { role } });
  await logAudit({
    workspaceId: membership.workspaceId,
    actorId: session.user.id,
    action: "role.changed",
    targetType: "user",
    targetId: userId,
    metadata: { from: target.role, to: role },
  });
  revalidatePath("/", "layout");
}

export async function assignToSpace(spaceId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertManagesSpace(session.user.id, membership.role, spaceId);

  await prisma.spaceMember.upsert({
    where: { userId_spaceId: { userId, spaceId } },
    update: {},
    create: { userId, spaceId },
  });
  await logAudit({ workspaceId: membership.workspaceId, actorId: session.user.id, action: "space.member_added", targetType: "space", targetId: spaceId, metadata: { userId } });
  revalidatePath("/", "layout");
}

export async function removeFromSpace(spaceId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  await assertManagesSpace(session.user.id, membership.role, spaceId);

  await prisma.spaceMember.deleteMany({ where: { userId, spaceId } });
  await logAudit({ workspaceId: membership.workspaceId, actorId: session.user.id, action: "space.member_removed", targetType: "space", targetId: spaceId, metadata: { userId } });
  revalidatePath("/", "layout");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(input: { email: string; role: "ADMIN" | "MEMBER" | "GUEST"; spaceId?: string; listId?: string }) {
  const session = await auth();
  if (!session?.user?.id) return;
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.userMembership.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId: membership.workspaceId } },
    });
    if (existingMembership) throw new Error("This person is already in the workspace. Change their role instead of inviting them again.");
  }

  if (input.role === "ADMIN") {
    if (membership.role !== "OWNER") throw new Error("Only the owner can invite admins");
  } else if (input.role === "MEMBER") {
    if (!input.spaceId) throw new Error("A space is required to invite a member");
    await assertManagesSpace(session.user.id, membership.role, input.spaceId);
  } else if (input.role === "GUEST") {
    if (!input.listId) throw new Error("A list is required to invite a guest");
    await requireListAccess(session.user.id, input.listId);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const invite = await prisma.invite.create({
    data: {
      email,
      role: input.role,
      token,
      workspaceId: membership.workspaceId,
      invitedById: session.user.id,
      spaceId: input.role === "GUEST" ? null : input.spaceId,
      listId: input.role === "GUEST" ? input.listId : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  try {
    await sendMail(email, "You're invited to Rally", {
      heading: "You're invited to Rally",
      paragraphs: [`You've been invited to join a Rally workspace as ${input.role.toLowerCase()}.`],
      cta: { label: "Accept invite", url },
      footer: "This invite link expires in 7 days.",
    });
  } catch (err) {
    console.error("Failed to send invite email", err);
  }

  await logAudit({
    workspaceId: membership.workspaceId,
    actorId: session.user.id,
    action: "invite.created",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email, role: input.role },
  });

  revalidatePath("/", "layout");
  return { url };
}

export async function revokeInvite(inviteId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.acceptedAt) return;

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");
  if (membership.role !== "OWNER" && invite.invitedById !== session.user.id) throw new Error("Forbidden");

  await prisma.invite.delete({ where: { id: inviteId } });
  await logAudit({
    workspaceId: membership.workspaceId,
    actorId: session.user.id,
    action: "invite.revoked",
    targetType: "invite",
    targetId: inviteId,
    metadata: { email: invite.email, role: invite.role },
  });
  revalidatePath("/", "layout");
}

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  const invite = await prisma.invite.findUnique({ where: { token: input.token } });
  if (!invite) throw new Error("This invite link is invalid.");
  if (invite.acceptedAt) throw new Error("This invite has already been used.");
  if (invite.expiresAt < new Date()) throw new Error("This invite has expired.");

  const name = input.name.trim();
  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
  if (!existingUser) validatePassword(input.password, [name, invite.email]);

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        email: invite.email,
        name: name || invite.email,
        passwordHash: await bcrypt.hash(input.password, 10),
      },
    }));

  await prisma.userMembership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    update: {},
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
  });

  if (invite.spaceId) {
    await prisma.spaceMember.upsert({
      where: { userId_spaceId: { userId: user.id, spaceId: invite.spaceId } },
      update: {},
      create: { userId: user.id, spaceId: invite.spaceId },
    });
  }
  if (invite.listId) {
    await prisma.guestShare.upsert({
      where: { userId_listId: { userId: user.id, listId: invite.listId } },
      update: {},
      create: { workspaceId: invite.workspaceId, userId: user.id, listId: invite.listId },
    });
  }

  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await logAudit({
    workspaceId: invite.workspaceId,
    actorId: user.id,
    action: "invite.accepted",
    targetType: "invite",
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role },
  });
  revalidatePath("/", "layout");
}

export async function updateTaskStatus(taskId: string, status: TaskStatusInput) {
  const session = await auth();
  if (!session?.user?.id) return;
  await updateTaskStatusOperation(session.user.id, taskId, status);
  revalidatePath("/", "layout");
}

export async function updateTaskPriority(taskId: string, priority: TaskPriorityInput) {
  const session = await auth();
  if (!session?.user?.id) return;
  await updateTaskPriorityOperation(session.user.id, taskId, priority);
  revalidatePath("/", "layout");
}

export async function updateTaskDueDate(taskId: string, dueDate: string | null) {
  const session = await auth();
  if (!session?.user?.id) return;
  await updateTaskDueDateOperation(session.user.id, taskId, dueDate);
  revalidatePath("/", "layout");
}

export async function addTaskAssignee(taskId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const taskTitle = await addTaskAssigneeOperation(session.user.id, taskId, userId);
  const actor = session.user.name ?? session.user.email ?? "Someone";
  await notify(userId, session.user.id, `${actor} assigned you to '${taskTitle}'`, taskId, "taskAssigned");
  revalidatePath("/", "layout");
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await removeTaskAssigneeOperation(session.user.id, taskId, userId);
  revalidatePath("/", "layout");
}

export async function addChecklistItem(taskId: string, text: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await addChecklistItemOperation(session.user.id, taskId, text);
  revalidatePath("/", "layout");
}

export async function toggleChecklistItem(itemId: string, done: boolean) {
  const session = await auth();
  if (!session?.user?.id) return;
  await toggleChecklistItemOperation(session.user.id, itemId, done);
  revalidatePath("/", "layout");
}

export async function deleteChecklistItem(itemId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await deleteChecklistItemOperation(session.user.id, itemId);
  revalidatePath("/", "layout");
}

export async function createCustomField(listId: string, name: string, type: CustomFieldTypeInput, options: string[]) {
  const session = await auth();
  if (!session?.user?.id) return;
  await createCustomFieldOperation(session.user.id, listId, name, type, options);
  revalidatePath("/", "layout");
}

export async function deleteCustomField(fieldId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await deleteCustomFieldOperation(session.user.id, fieldId);
  revalidatePath("/", "layout");
}

export async function setCustomFieldValue(taskId: string, customFieldId: string, value: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await setCustomFieldValueOperation(session.user.id, taskId, customFieldId, value);
  revalidatePath("/", "layout");
}

export async function addTaskDependency(taskId: string, dependsOnId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await addTaskDependencyOperation(session.user.id, taskId, dependsOnId);
  revalidatePath("/", "layout");
}

export async function removeTaskDependency(taskId: string, dependsOnId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await removeTaskDependencyOperation(session.user.id, taskId, dependsOnId);
  revalidatePath("/", "layout");
}

export async function uploadAttachment(taskId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const access = await requireEditableTask(session.user.id, taskId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("File exceeds the 2MB per-file limit");
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) throw new Error("That file type isn't allowed");

  const { _sum } = await prisma.attachment.aggregate({ where: { taskId }, _sum: { size: true } });
  if ((_sum.size ?? 0) + file.size > MAX_TASK_ATTACHMENTS_BYTES) {
    throw new Error("This task's attachments exceed the 5MB total limit");
  }

  const key = await saveAttachmentFile(file);
  await createAttachmentOperation(session.user.id, taskId, { storageKey: key, filename: file.name || "file", mimeType: file.type || "application/octet-stream", size: file.size });
  await logAudit({
    workspaceId: access.workspaceId,
    actorId: session.user.id,
    action: "attachment.uploaded",
    targetType: "task",
    targetId: taskId,
    metadata: { filename: file.name, size: file.size },
  });
  revalidatePath("/", "layout");
}

export async function deleteAttachment(attachmentId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const deleted = await deleteAttachmentOperation(session.user.id, attachmentId);
  if (deleted) {
    await deleteAttachmentFile(deleted.url).catch((err) => console.error("Failed to delete attachment file", err));
    await logAudit({
      workspaceId: deleted.workspaceId,
      actorId: session.user.id,
      action: "attachment.deleted",
      targetType: "attachment",
      targetId: attachmentId,
      metadata: { filename: deleted.filename },
    });
  }
  revalidatePath("/", "layout");
}

export async function updateSlackWebhook(url: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const membership = await myMembership(session.user.id);
  if (!membership || membership.role !== "OWNER") throw new Error("Only the owner can change the Slack integration");

  const trimmed = url.trim();
  if (trimmed && !trimmed.startsWith("https://hooks.slack.com/")) throw new Error("That doesn't look like a Slack incoming webhook URL");

  await prisma.workspace.update({ where: { id: membership.workspaceId }, data: { slackWebhookUrl: trimmed || null } });
  await logAudit({
    workspaceId: membership.workspaceId,
    actorId: session.user.id,
    action: "workspace.slack_webhook_changed",
    targetType: "workspace",
    targetId: membership.workspaceId,
    metadata: { cleared: !trimmed },
  });
  revalidatePath("/", "layout");
}

export async function getOrCreateDirectChannel(otherUserId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (otherUserId === session.user.id) throw new Error("Can't message yourself");

  const membership = await myMembership(session.user.id);
  if (!membership) throw new Error("Forbidden");

  const other = await prisma.userMembership.findUnique({
    where: { userId_workspaceId: { userId: otherUserId, workspaceId: membership.workspaceId } },
  });
  if (!other) throw new Error("That person isn't in your workspace");

  const existing = await prisma.channel.findFirst({
    where: {
      workspaceId: membership.workspaceId,
      isDirect: true,
      AND: [{ members: { some: { id: session.user.id } } }, { members: { some: { id: otherUserId } } }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.channel.create({
    data: { workspaceId: membership.workspaceId, isDirect: true, members: { connect: [{ id: session.user.id }, { id: otherUserId }] } },
    select: { id: true },
  });
  revalidatePath("/", "layout");
  return created.id;
}

export async function deleteTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await deleteTaskOperation(session.user.id, taskId);
  revalidatePath("/", "layout");
}

export async function updateTaskDescription(taskId: string, description: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await updateTaskDescriptionOperation(session.user.id, taskId, description);
  revalidatePath("/", "layout");
}

export async function updateTaskTitle(taskId: string, title: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await updateTaskTitleOperation(session.user.id, taskId, title);
  revalidatePath("/", "layout");
}

export async function moveTaskToList(taskId: string, listId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await moveTaskToListOperation(session.user.id, taskId, listId);
  revalidatePath("/", "layout");
}

export async function updateProfileName(name: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { name: trimmed } });
  revalidatePath("/", "layout");
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  const session = await auth();
  if (!session?.user?.id) return;

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, passwordHash: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new Error("Current password is incorrect");
  }
  validatePassword(newPassword, [user.name ?? "", user.email]);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
}

const RESET_TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Only ever act silently either way, so this can't be used to find out which emails have accounts.
  if (!user?.passwordHash) return;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });

  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password/${token}`;
  try {
    await sendMail(user.email, "Reset your Rally password", {
      heading: "Reset your password",
      paragraphs: ["We received a request to reset your Rally password."],
      cta: { label: "Reset password", url },
      footer: "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
    });
  } catch (err) {
    console.error("Failed to send password reset email", err);
  }
}

export async function resetPassword(input: { token: string; password: string }) {
  const reset = await prisma.passwordResetToken.findUnique({ where: { token: input.token }, include: { user: true } });
  if (!reset || reset.expiresAt < new Date()) throw new Error("This reset link is invalid or has expired.");
  validatePassword(input.password, [reset.user.name ?? "", reset.user.email]);

  const passwordHash = await bcrypt.hash(input.password, 10);
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } });
  await prisma.passwordResetToken.delete({ where: { token: input.token } });
}

export async function updateNotificationPrefs(prefs: Record<string, boolean>) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { notificationPrefs: prefs } });
  revalidatePath("/", "layout");
}

export async function markChannelRead(channelId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { members: { select: { id: true } } } });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) return;
  await prisma.channelRead.upsert({
    where: { userId_channelId: { userId: session.user.id, channelId } },
    create: { userId: session.user.id, channelId },
    update: { lastReadAt: new Date() },
  });
  revalidatePath("/", "layout");
}

const messageInclude = { author: { select: { id: true, name: true, email: true } }, attachments: { include: { uploadedBy: { select: { id: true, name: true, email: true } } } } } as const;

type MessageWithRelations = {
  id: string;
  body: string;
  createdAt: Date;
  parentMessageId: string | null;
  author: { id: string; name: string | null; email: string };
  attachments: { id: string; filename: string; mimeType: string; size: number; createdAt: Date; uploadedBy: { id: string; name: string | null; email: string } }[];
};

function toUiMessage(message: MessageWithRelations): UiMessage {
  const attachment = message.attachments[0];
  return {
    id: message.id,
    author: toAvatar(message.author),
    text: message.body,
    time: timeFormatter.format(message.createdAt),
    parentMessageId: message.parentMessageId,
    attachment: attachment ? { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, uploadedBy: toAvatar(attachment.uploadedBy), time: timeAgo(attachment.createdAt) } : null,
  };
}

/** Pushes a new message to every member's open tabs over the WebSocket (see server.ts) —
 * including the sender's, so a second tab of theirs stays live too. No DB polling involved:
 * this reuses the channel-membership row the caller already fetched to create the message. */
function broadcastMessage(channel: { id: string; name: string | null; isDirect: boolean; members: { id: string }[] }, message: UiMessage) {
  broadcastToUsers(channel.members.map((m) => m.id), {
    type: "message",
    channelId: channel.id,
    channelName: channel.isDirect ? "a direct message" : `#${channel.name ?? "chat"}`,
    message,
  });
}

export async function postMessage(channelId: string, body: string, parentMessageId?: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true, isDirect: true, members: { select: { id: true } } },
  });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) throw new Error("Forbidden");

  if (parentMessageId) {
    const parent = await prisma.message.findUnique({ where: { id: parentMessageId }, select: { channelId: true } });
    if (!parent || parent.channelId !== channelId) throw new Error("Invalid thread");
  }

  const message = await prisma.message.create({
    data: { channelId, authorId: session.user.id, body: trimmed, parentMessageId: parentMessageId ?? null },
    include: messageInclude,
  });
  broadcastMessage({ id: channelId, ...channel }, toUiMessage(message));

  const actor = session.user.name ?? session.user.email ?? "Someone";
  const memberIds = new Set(channel.members.map((m) => m.id));
  const mentioned = mentionedUserIds(trimmed).filter((id) => memberIds.has(id));
  for (const userId of mentioned) {
    await notify(userId, session.user.id, `${actor} mentioned you in #${channel.name ?? "chat"}`, undefined, "chatMentions");
  }

  revalidatePath("/", "layout");
}

export async function postMessageWithAttachment(channelId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const body = String(formData.get("body") ?? "").trim();
  const parentMessageId = (formData.get("parentMessageId") as string | null) || undefined;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("File exceeds the 2MB per-file limit");
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) throw new Error("That file type isn't allowed");

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true, isDirect: true, members: { select: { id: true } } },
  });
  if (!channel || !channel.members.some((m) => m.id === session.user.id)) throw new Error("Forbidden");

  if (parentMessageId) {
    const parent = await prisma.message.findUnique({ where: { id: parentMessageId }, select: { channelId: true } });
    if (!parent || parent.channelId !== channelId) throw new Error("Invalid thread");
  }

  const key = await saveAttachmentFile(file);
  const message = await prisma.message.create({
    data: {
      channelId,
      authorId: session.user.id,
      body,
      parentMessageId: parentMessageId ?? null,
      attachments: { create: { url: key, filename: file.name || "file", mimeType: file.type || "application/octet-stream", size: file.size, uploadedById: session.user.id } },
    },
    include: messageInclude,
  });
  broadcastMessage({ id: channelId, ...channel }, toUiMessage(message));

  if (body) {
    const actor = session.user.name ?? session.user.email ?? "Someone";
    const memberIds = new Set(channel.members.map((m) => m.id));
    const mentioned = mentionedUserIds(body).filter((id) => memberIds.has(id));
    for (const userId of mentioned) {
      await notify(userId, session.user.id, `${actor} mentioned you in #${channel.name ?? "chat"}`, undefined, "chatMentions");
    }
  }

  revalidatePath("/", "layout");
}

export type TaskPreview = { id: string; title: string; status: StatusKey; spaceId: string };

/** Batched title/status lookup for task links unfurled inside a chat message (`?task=<id>`).
 * Tasks the caller can't see (wrong workspace, or a space they're not a member of) are silently
 * dropped rather than erroring, since a chat message is free text and may reference anything. */
export async function getTaskPreviews(taskIds: string[]): Promise<TaskPreview[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const uniqueIds = [...new Set(taskIds)];
  if (uniqueIds.length === 0) return [];

  const membership = await myMembership(session.user.id);
  if (!membership || membership.role === "GUEST") return [];

  const tasks = await prisma.task.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      title: true,
      status: true,
      list: { select: { spaceId: true, space: { select: { workspaceId: true, members: { where: { userId: session.user.id }, select: { id: true } } } } } },
    },
  });

  return tasks
    .filter((task) => task.list.space.workspaceId === membership.workspaceId && (membership.role === "OWNER" || task.list.space.members.length > 0))
    .map((task) => ({ id: task.id, title: task.title, status: statusByDatabaseValue[task.status] ?? "todo", spaceId: task.list.spaceId }));
}

export async function postComment(taskId: string, body: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  const trimmed = body.trim();
  if (!trimmed) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      listId: true,
      title: true,
      createdById: true,
      assignees: { select: { id: true } },
      list: { select: { space: { select: { workspaceId: true } } } },
    },
  });
  if (!task) return;
  await assertListAccess(session.user.id, task.listId);

  await prisma.comment.create({ data: { taskId, authorId: session.user.id, body: trimmed } });

  const actor = session.user.name ?? session.user.email ?? "Someone";
  const recipients = new Set([task.createdById, ...task.assignees.map((a) => a.id)]);
  for (const userId of recipients) {
    await notify(userId, session.user.id, `${actor} commented on '${task.title}'`, taskId, "comments");
  }

  // ponytail: mentions are validated against workspace membership, not this
  // task's specific space, so a mention can reach someone without space
  // access. Tighten to space-scoped members if that leak matters.
  const mentioned = await filterWorkspaceMembers(task.list.space.workspaceId, mentionedUserIds(trimmed));
  for (const userId of mentioned) {
    if (recipients.has(userId)) continue;
    await notify(userId, session.user.id, `${actor} mentioned you in a comment on '${task.title}'`, taskId, "comments");
  }

  revalidatePath("/", "layout");
}

export async function markNotificationRead(notificationId: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { id: notificationId, userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
