export type UiAvatar = { id: string; name: string; initials: string; hue: number };
export type PriorityKey = "urgent" | "high" | "normal" | "low";
export type StatusKey = "todo" | "in_progress" | "review" | "done";
export type RoleKey = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export type UiComment = { id: string; author: UiAvatar; body: string; time: string };
export type UiAttachment = { id: string; filename: string; mimeType: string; size: number; uploadedBy: UiAvatar; time: string };
export type UiTaskRef = { id: string; title: string; status: StatusKey };
export type UiChecklistItem = { id: string; text: string; done: boolean };
export type UiCustomField = { id: string; name: string; type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN"; options: string[] };
export type UiCustomFieldValue = { fieldId: string; value: string };

export type UiTask = {
  id: string;
  listId: string;
  title: string;
  desc: string;
  status: StatusKey;
  priority: PriorityKey;
  due: string;
  dueDate: string | null;
  assignees: UiAvatar[];
  createdBy: UiAvatar;
  checklist: UiChecklistItem[];
  customFieldValues: UiCustomFieldValue[];
  comments: UiComment[];
  attachments: UiAttachment[];
  dependsOn: UiTaskRef[];
  dependents: UiTaskRef[];
};

export type UiList = { id: string; name: string; isSprint: boolean; sprintStart: string | null; sprintEnd: string | null; tasks: UiTask[]; customFields: UiCustomField[] };
export type UiSpace = { id: string; name: string; hue: number; members: UiAvatar[]; lists: UiList[] };
export type UiMessage = { id: string; author: UiAvatar; text: string; time: string; parentMessageId: string | null; attachment: UiAttachment | null };
export type UiChannel = { id: string; name: string; isDirect: boolean; unread: number; members: UiAvatar[]; messages: UiMessage[] };
export type UiInvite = { id: string; email: string; role: string; scope: string | null; url: string };
export type UiMember = UiAvatar & { role: RoleKey };
export type UiNotification = { id: string; text: string; time: string; read: boolean; taskId: string | null; spaceId: string | null };

/** Sidebar-weight summary of a space — no task/list bodies, just enough to render the switcher. */
export type UiSpaceSummary = { id: string; name: string; hue: number; listLabel: string };
/** Sidebar-weight summary of a channel — no message history. */
export type UiChannelSummary = { id: string; name: string; isDirect: boolean; unread: number };

/** Data every route under (app) needs: nav chrome, the notification bell, and guests' one-and-only "home". */
export type WorkspaceShellData = {
  workspaceName: string;
  currentUser: UiAvatar;
  currentUserEmail: string;
  isGuestRole: boolean;
  role: RoleKey;
  spaces: UiSpaceSummary[];
  sharedLists: UiList[];
  members: UiAvatar[];
  channels: UiChannelSummary[];
  notifications: UiNotification[];
  notificationPrefs: Record<string, boolean> | null;
};

/** A space with its lists/tasks in full, for the board/list/sprint views and the task detail panel. */
export type TaskBoardData = { space: UiSpace };

/** One space as shown in the admin console: enough for the members/custom-fields editor, no task bodies. */
export type UiManageSpace = { id: string; name: string; hue: number; members: UiAvatar[]; memberCount: number; taskCount: number; lists: { id: string; name: string; customFields: UiCustomField[] }[] };
export type ManageData = {
  spaces: UiManageSpace[];
  allMembers: UiMember[];
  pendingInvites: UiInvite[];
  allLists: { id: string; label: string }[];
  slackWebhookUrl: string | null;
};
