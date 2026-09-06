"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { StatusKey, UiList, UiSpace } from "@/lib/rally-types";
import { Pill, STATUSES } from "@/app/components/primitives";
import { AvatarStack, PRIORITY, isOverdue } from "@/app/components/task-visuals";
import { TaskPanel } from "@/app/components/task-panel";
import { createList, createTask, moveTaskToList, updateTaskStatus } from "@/app/actions";

type SpaceLike = { id: string | null; name: string; members: UiSpace["members"]; lists: UiList[] };

export function SpaceBoard({ space, isGuest, taskId }: { space: SpaceLike; isGuest: boolean; taskId?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const [activeView, setActiveView] = useState<"board" | "list" | "sprint">("board");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<"backlog" | "sprint" | null>(null);
  const [showListForm, setShowListForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListIsSprint, setNewListIsSprint] = useState(false);
  const [newListStart, setNewListStart] = useState("");
  const [newListEnd, setNewListEnd] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");

  const tasksInSpace = space.lists.flatMap((l) => l.tasks);
  const listById = new Map(space.lists.map((l) => [l.id, l]));
  const selectedTask = taskId ? tasksInSpace.find((t) => t.id === taskId) ?? null : null;

  function openTask(id: string) {
    router.push(`${pathname}?task=${id}`);
  }
  function closeTask() {
    router.push(pathname);
  }

  const sprintLists = isGuest ? [] : space.lists.filter((l) => l.isSprint);
  const sprintList = isGuest ? space.lists[0] : sprintLists.find((l) => l.id === selectedSprintId) ?? sprintLists[0];
  const targetList = isGuest ? space.lists[0] : space.lists.find((l) => l.isSprint) ?? space.lists[0];
  const backlogList = isGuest ? undefined : space.lists.find((l) => !l.isSprint);
  const backlogTasks = isGuest ? [] : space.lists.filter((l) => !l.isSprint).flatMap((l) => l.tasks);

  const boardColumns = STATUSES.map((st) => ({ key: st.key, label: st.label, tasks: tasksInSpace.filter((t) => t.status === st.key) }));
  const sprintTasks = sprintList?.tasks ?? [];
  const sprintDone = sprintTasks.filter((t) => t.status === "done").length;
  const sprintInfo = { name: sprintList?.name ?? "No sprint yet", done: sprintDone, total: sprintTasks.length, pct: sprintTasks.length ? Math.round((sprintDone / sprintTasks.length) * 100) : 0 };

  async function handleCreateTask() {
    const title = newTaskTitle.trim();
    if (!title || !targetList) return;
    setAddingTask(true);
    try {
      await createTask(targetList.id, title);
      setNewTaskTitle("");
    } finally {
      setAddingTask(false);
    }
  }

  function handleDrop(status: StatusKey) {
    setDragOverStatus(null);
    const id = draggedTaskId;
    setDraggedTaskId(null);
    if (!id) return;
    const task = tasksInSpace.find((t) => t.id === id);
    if (!task || task.status === status) return;
    updateTaskStatus(id, status);
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name || !space.id || creatingList) return;
    setCreatingList(true);
    try {
      await createList(space.id, name, newListIsSprint, newListStart || undefined, newListEnd || undefined);
      setNewListName("");
      setNewListIsSprint(false);
      setNewListStart("");
      setNewListEnd("");
      setShowListForm(false);
    } finally {
      setCreatingList(false);
    }
  }

  async function handleCreateSprint() {
    const name = newSprintName.trim();
    if (!name || !space.id || creatingSprint) return;
    setCreatingSprint(true);
    try {
      await createList(space.id, name, true, newSprintStart || undefined, newSprintEnd || undefined);
      setNewSprintName("");
      setNewSprintStart("");
      setNewSprintEnd("");
      setShowSprintForm(false);
    } finally {
      setCreatingSprint(false);
    }
  }

  const tabStyle = (key: typeof activeView) => ({ bg: activeView === key ? "#fff" : "transparent", color: activeView === key ? "oklch(0.68 0.16 35)" : "oklch(0.5 0.01 60)" });
  const boardTab = tabStyle("board");
  const listTab = tabStyle("list");
  const sprintTab = tabStyle("sprint");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", borderBottom: "1px solid oklch(0.9 0.006 60)", flex: "none", alignItems: "flex-end" }}>
        <button onClick={() => setActiveView("board")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: boardTab.bg, color: boardTab.color }}>
          Board
        </button>
        <button onClick={() => setActiveView("list")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: listTab.bg, color: listTab.color }}>
          List
        </button>
        <button onClick={() => setActiveView("sprint")} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: sprintTab.bg, color: sprintTab.color }}>
          Sprint
        </button>
        <div style={{ flex: 1 }} />
        {!isGuest && (
          <div style={{ marginBottom: 6, display: "flex", gap: 6 }}>
            <button onClick={() => setShowListForm((v) => !v)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", color: "oklch(0.35 0.01 60)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + List
            </button>
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
              placeholder="New task title"
              disabled={addingTask}
              style={{ height: 32, width: 180, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit" }}
            />
            <button onClick={handleCreateTask} disabled={addingTask || !newTaskTitle.trim() || !targetList} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, opacity: addingTask || !newTaskTitle.trim() || !targetList ? 0.6 : 1 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Task
            </button>
          </div>
        )}
      </div>

      {showListForm && space.id && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid oklch(0.9 0.006 60)", background: "oklch(0.97 0.006 60)", flex: "none" }}>
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "oklch(0.4 0.01 60)" }}>
            <input type="checkbox" checked={newListIsSprint} onChange={(e) => setNewListIsSprint(e.target.checked)} />
            Sprint
          </label>
          {newListIsSprint && (
            <>
              <input type="date" value={newListStart} onChange={(e) => setNewListStart(e.target.value)} style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 8px", fontSize: 12.5, fontFamily: "inherit" }} />
              <span style={{ fontSize: 12, color: "oklch(0.55 0.01 60)" }}>to</span>
              <input type="date" value={newListEnd} onChange={(e) => setNewListEnd(e.target.value)} style={{ height: 30, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "0 8px", fontSize: 12.5, fontFamily: "inherit" }} />
            </>
          )}
          <button onClick={handleCreateList} disabled={!newListName.trim() || creatingList} style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: !newListName.trim() || creatingList ? 0.6 : 1 }}>
            Create
          </button>
          <button onClick={() => setShowListForm(false)} style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", color: "oklch(0.5 0.01 60)", fontSize: 12.5, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      {activeView === "board" ? (
        <div style={{ flex: 1, display: "flex", gap: 16, padding: 20, overflowX: "auto", overflowY: "hidden" }}>
          {boardColumns.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (!draggedTaskId || isGuest) return;
                e.preventDefault();
                setDragOverStatus(col.key);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === col.key ? null : s))}
              onDrop={(e) => {
                if (!draggedTaskId || isGuest) return;
                e.preventDefault();
                handleDrop(col.key);
              }}
              style={{ width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, borderRadius: 12, background: dragOverStatus === col.key ? "oklch(0.93 0.05 35)" : "transparent", transition: "background 0.1s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.4 0.01 60)" }}>{col.label}</div>
                <div style={{ fontSize: 11.5, color: "oklch(0.55 0.01 60)" }}>{col.tasks.length}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                {col.tasks.map((task) => {
                  const priorityInfo = PRIORITY[task.priority];
                  const blockedCount = task.dependsOn.filter((d) => d.status !== "done").length;
                  const overdue = isOverdue(task);
                  return (
                    <button
                      key={task.id}
                      className="rl-taskcard"
                      onClick={() => openTask(task.id)}
                      draggable={!isGuest}
                      onDragStart={(e) => {
                        setDraggedTaskId(task.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverStatus(null);
                      }}
                      style={{ textAlign: "left", background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 14, cursor: isGuest ? "pointer" : "grab", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 1px 2px oklch(0 0 0 / 0.04)", opacity: draggedTaskId === task.id ? 0.4 : 1 }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, color: "oklch(0.2 0.01 60)" }}>{task.title}</div>
                      {blockedCount > 0 && <Pill bg="oklch(0.9 0.09 25)" fg="oklch(0.4 0.15 25)">Blocked &times;{blockedCount}</Pill>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>{priorityInfo.label}</Pill>
                        <span style={{ fontSize: 11.5, fontWeight: overdue ? 700 : 400, color: overdue ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.01 60)" }}>{task.due}</span>
                        <div style={{ flex: 1 }} />
                        <AvatarStack avatars={task.assignees} size={22} fontSize={9.5} />
                      </div>
                    </button>
                  );
                })}
                {col.tasks.length === 0 && <div style={{ fontSize: 12, color: "oklch(0.55 0.01 60)", padding: "8px 4px" }}>Nothing here.</div>}
              </div>
            </div>
          ))}
        </div>
      ) : activeView === "list" ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <div style={{ flex: 1 }}>Task</div>
            <div style={{ width: 90 }}>Priority</div>
            <div style={{ width: 90 }}>Due</div>
            <div style={{ width: 36 }} />
          </div>
          {tasksInSpace.map((task) => {
            const priorityInfo = PRIORITY[task.priority];
            const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
            return (
              <button key={task.id} onClick={() => openTask(task.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", borderTop: "1px solid oklch(0.93 0.006 60)", background: "#fff", cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flex: "none" }} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.22 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                </div>
                <div style={{ width: 90 }}>
                  <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>{priorityInfo.label}</Pill>
                </div>
                <div style={{ width: 90, fontSize: 12, fontWeight: isOverdue(task) ? 700 : 400, color: isOverdue(task) ? "oklch(0.55 0.18 25)" : "oklch(0.5 0.01 60)" }}>{task.due}</div>
                <div style={{ width: 36, display: "flex", justifyContent: "flex-end" }}>
                  <AvatarStack avatars={task.assignees} size={22} fontSize={9.5} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {!isGuest && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {sprintLists.map((l) => (
                <button key={l.id} onClick={() => setSelectedSprintId(l.id)} style={{ border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: sprintList?.id === l.id ? "oklch(0.68 0.16 35)" : "oklch(0.93 0.006 60)", color: sprintList?.id === l.id ? "#fff" : "oklch(0.4 0.01 60)" }}>
                  {l.name}
                </button>
              ))}
              <button onClick={() => setShowSprintForm((v) => !v)} style={{ border: "1px dashed oklch(0.75 0.006 60)", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: "transparent", color: "oklch(0.5 0.01 60)" }}>
                + New sprint
              </button>
            </div>
          )}
          {showSprintForm && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10, padding: 12 }}>
              <input value={newSprintName} onChange={(e) => setNewSprintName(e.target.value)} placeholder="Sprint name" style={{ flex: 1, minWidth: 140, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
              <input type="date" value={newSprintStart} onChange={(e) => setNewSprintStart(e.target.value)} style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit" }} />
              <span style={{ fontSize: 12, color: "oklch(0.55 0.01 60)" }}>to</span>
              <input type="date" value={newSprintEnd} onChange={(e) => setNewSprintEnd(e.target.value)} style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontFamily: "inherit" }} />
              <button onClick={handleCreateSprint} disabled={!newSprintName.trim() || creatingSprint} style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", height: 34, borderRadius: 8, cursor: "pointer", opacity: !newSprintName.trim() || creatingSprint ? 0.6 : 1 }}>
                Create
              </button>
              <button onClick={() => setShowSprintForm(false)} style={{ border: "none", background: "transparent", color: "oklch(0.5 0.01 60)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          )}
          {!sprintList ? (
            <div style={{ fontSize: 13, color: "oklch(0.55 0.01 60)", padding: "20px 4px" }}>{isGuest ? "Nothing shared yet." : "No sprint yet. Click “+ New sprint” above to start one."}</div>
          ) : (
            <>
              <div style={{ background: "#fff", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{sprintInfo.name}</div>
                  {(sprintList.sprintStart || sprintList.sprintEnd) && (
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.01 60)" }}>
                      {sprintList.sprintStart ?? "?"} &rarr; {sprintList.sprintEnd ?? "?"}
                    </div>
                  )}
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "oklch(0.92 0.006 60)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, background: "oklch(0.68 0.16 35)", width: `${sprintInfo.pct}%` }} />
                </div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.01 60)" }}>{sprintInfo.done} of {sprintInfo.total} tasks done</div>
              </div>
              {isGuest ? (
                sprintTasks.map((task) => {
                  const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
                  const statusLabel = STATUSES.find((s) => s.key === task.status)!.label;
                  return (
                    <button key={task.id} onClick={() => openTask(task.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", borderTop: "1px solid oklch(0.93 0.006 60)", background: "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flex: "none" }} />
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.22 0.01 60)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "oklch(0.5 0.01 60)", width: 120 }}>{statusLabel}</div>
                      <div style={{ width: 90, fontSize: 12, color: "oklch(0.5 0.01 60)" }}>{task.due}</div>
                    </button>
                  );
                })
              ) : (
                <div className="rl-sprint-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 280 }}>
                  {([{ key: "backlog" as const, label: "Backlog", tasks: backlogTasks, targetListId: backlogList?.id }, { key: "sprint" as const, label: "This sprint", tasks: sprintTasks, targetListId: sprintList.id }]).map((col) => (
                    <div
                      key={col.key}
                      onDragOver={(e) => {
                        if (!draggedTaskId || !col.targetListId) return;
                        e.preventDefault();
                        setDragOverColumn(col.key);
                      }}
                      onDragLeave={() => setDragOverColumn((c) => (c === col.key ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverColumn(null);
                        const id = draggedTaskId;
                        setDraggedTaskId(null);
                        if (!id || !col.targetListId) return;
                        moveTaskToList(id, col.targetListId);
                      }}
                      style={{ display: "flex", flexDirection: "column", gap: 8, background: dragOverColumn === col.key ? "oklch(0.93 0.05 35)" : "oklch(0.97 0.006 60)", borderRadius: 12, padding: 12, minHeight: 200, transition: "background 0.1s" }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.45 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", padding: "0 4px" }}>
                        {col.label} &middot; {col.tasks.length}
                      </div>
                      {col.tasks.map((task) => {
                        const priorityInfo = PRIORITY[task.priority];
                        const statusColor = STATUSES.find((s) => s.key === task.status)!.color;
                        return (
                          <button
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedTaskId(task.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedTaskId(null);
                              setDragOverColumn(null);
                            }}
                            onClick={() => openTask(task.id)}
                            style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid oklch(0.91 0.006 60)", borderRadius: 10, background: "#fff", cursor: "grab", opacity: draggedTaskId === task.id ? 0.4 : 1 }}
                          >
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flex: "none" }} />
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
                            <Pill bg={priorityInfo.bg} fg={priorityInfo.fg}>{priorityInfo.label}</Pill>
                          </button>
                        );
                      })}
                      {col.tasks.length === 0 && <div style={{ fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "8px 4px" }}>Nothing here.</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedTask && (
        <TaskPanel
          key={selectedTask.id}
          task={selectedTask}
          isGuest={isGuest}
          members={space.members}
          dependencyCandidates={tasksInSpace}
          customFields={listById.get(selectedTask.listId)?.customFields ?? []}
          onOpenTask={openTask}
          onClose={closeTask}
        />
      )}
    </div>
  );
}
