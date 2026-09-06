"use client";

import { useState } from "react";
import type { PriorityKey, StatusKey, UiAvatar, UiCustomField, UiTask, UiTaskRef } from "@/lib/rally-types";
import { STATUSES } from "./primitives";
import { PRIORITY } from "./task-visuals";
import { TaskDetailHeader } from "./task-detail-header";
import { TaskAssignees } from "./task-assignees";
import { TaskDescription } from "./task-description";
import { TaskChecklist } from "./task-checklist";
import { TaskCustomFields } from "./task-custom-fields";
import { TaskDependencies } from "./task-dependencies";
import { TaskAttachments } from "./task-attachments";
import { TaskComments } from "./task-comments";
import {
  addChecklistItem,
  addTaskAssignee,
  addTaskDependency,
  deleteAttachment,
  deleteChecklistItem,
  deleteTask,
  postComment,
  removeTaskAssignee,
  removeTaskDependency,
  setCustomFieldValue,
  toggleChecklistItem,
  updateTaskDescription,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
  uploadAttachment,
} from "@/app/actions";

type SavingField = "status" | "priority" | "due" | "desc" | "title" | "assignee" | null;

export function TaskPanel({
  task,
  isGuest,
  members,
  dependencyCandidates,
  customFields,
  onOpenTask,
  onClose,
}: {
  task: UiTask;
  isGuest: boolean;
  members: UiAvatar[];
  dependencyCandidates: UiTaskRef[];
  customFields: UiCustomField[];
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [savingField, setSavingField] = useState<SavingField>(null);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  async function handleStatusChange(status: StatusKey) {
    setSavingField("status");
    try {
      await updateTaskStatus(task.id, status);
    } finally {
      setSavingField(null);
    }
  }

  async function handlePriorityChange(priority: PriorityKey) {
    setSavingField("priority");
    try {
      await updateTaskPriority(task.id, priority);
    } finally {
      setSavingField(null);
    }
  }

  async function handleAddAssignee(userId: string) {
    setSavingField("assignee");
    setError(null);
    try {
      await addTaskAssignee(task.id, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add assignee");
    } finally {
      setSavingField(null);
    }
  }

  async function handleRemoveAssignee(userId: string) {
    setSavingField("assignee");
    try {
      await removeTaskAssignee(task.id, userId);
    } finally {
      setSavingField(null);
    }
  }

  async function handleAddDependency(dependsOnId: string) {
    setError(null);
    try {
      await addTaskDependency(task.id, dependsOnId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add dependency");
    }
  }

  async function handleUploadAttachment(file: File | null) {
    if (!file) return;
    setUploadingAttachment(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await uploadAttachment(task.id, formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteTask() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    onClose();
    await deleteTask(task.id);
  }

  async function handleSaveTitle(title: string) {
    if (!title.trim()) return;
    setSavingField("title");
    try {
      await updateTaskTitle(task.id, title);
    } finally {
      setSavingField(null);
    }
  }

  async function handlePostComment() {
    const body = commentBody.trim();
    if (!body) return;
    setPostingComment(true);
    try {
      await postComment(task.id, body);
      setCommentBody("");
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div className="rl-taskpanel" style={{ width: 440, background: "#fff", height: "100%", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 18, boxShadow: "-8px 0 24px oklch(0 0 0 / 0.08)" }}>
        <TaskDetailHeader task={task} isGuest={isGuest} editMode={editMode} savingTitle={savingField === "title"} onClose={onClose} onDelete={handleDeleteTask} onSaveTitle={handleSaveTitle} onToggleEdit={() => setEditMode((v) => !v)} />
        {error && (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "8px 12px" }}>{error}</div>
        )}
        <TaskAssignees task={task} members={members} isGuest={isGuest} editMode={editMode} saving={savingField === "assignee"} onAdd={handleAddAssignee} onRemove={handleRemoveAssignee} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 14, background: "oklch(0.98 0.004 60)", borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Priority</div>
            {isGuest || !editMode ? (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: PRIORITY[task.priority].bg, color: PRIORITY[task.priority].fg }}>{PRIORITY[task.priority].label}</span>
            ) : (
              <select value={task.priority} onChange={(e) => handlePriorityChange(e.target.value as PriorityKey)} disabled={savingField === "priority"} style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
                {(Object.keys(PRIORITY) as PriorityKey[]).map((key) => (
                  <option key={key} value={key}>{PRIORITY[key].label}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Due date</div>
            {isGuest || !editMode ? (
              <div style={{ fontSize: 13, fontWeight: 600 }}>{task.due}</div>
            ) : (
              <input
                type="date"
                key={task.id}
                defaultValue={task.dueDate ?? ""}
                onChange={async (e) => {
                  setSavingField("due");
                  try {
                    await updateTaskDueDate(task.id, e.target.value || null);
                  } finally {
                    setSavingField(null);
                  }
                }}
                disabled={savingField === "due"}
                style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
              />
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Status</div>
            {isGuest || !editMode ? (
              <div style={{ fontSize: 13, fontWeight: 600 }}>{STATUSES.find((s) => s.key === task.status)!.label}</div>
            ) : (
              <select value={task.status} onChange={(e) => handleStatusChange(e.target.value as StatusKey)} disabled={savingField === "status"} style={{ fontSize: 12.5, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <TaskDescription
          task={task}
          isGuest={isGuest}
          editMode={editMode}
          editing={editingDesc}
          saving={savingField === "desc"}
          onStartEdit={() => setEditingDesc(true)}
          onSave={(description) => {
            setSavingField("desc");
            updateTaskDescription(task.id, description).finally(() => setSavingField(null));
            setEditingDesc(false);
          }}
        />
        <TaskChecklist
          checklist={task.checklist}
          isGuest={isGuest}
          newItemText={newChecklistText}
          onChangeNewItemText={setNewChecklistText}
          onAdd={async () => {
            const text = newChecklistText.trim();
            if (!text) return;
            setNewChecklistText("");
            await addChecklistItem(task.id, text);
          }}
          onToggle={(itemId, done) => toggleChecklistItem(itemId, done)}
          onDelete={(itemId) => deleteChecklistItem(itemId)}
        />
        <TaskCustomFields fields={customFields} values={task.customFieldValues} isGuest={isGuest} editMode={editMode} onSetValue={(fieldId, value) => setCustomFieldValue(task.id, fieldId, value)} />
        <TaskDependencies
          dependsOn={task.dependsOn}
          dependents={task.dependents}
          candidates={dependencyCandidates.filter((t) => t.id !== task.id && !task.dependsOn.some((d) => d.id === t.id))}
          isGuest={isGuest}
          editMode={editMode}
          onOpenTask={onOpenTask}
          onAdd={handleAddDependency}
          onRemove={(dependsOnId) => removeTaskDependency(task.id, dependsOnId)}
        />
        <TaskAttachments attachments={task.attachments} isGuest={isGuest} uploading={uploadingAttachment} onUpload={handleUploadAttachment} onDelete={(attachmentId) => deleteAttachment(attachmentId)} />
        <TaskComments comments={task.comments} candidates={members} value={commentBody} onChangeValue={setCommentBody} posting={postingComment} onPost={handlePostComment} />
      </div>
    </div>
  );
}
