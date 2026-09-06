// Exercises src/lib/tasks.ts (the operations the "use server" actions in
// src/app/actions.ts wrap) against a real local Postgres: task CRUD, status/
// priority/due-date, move, assignees, checklists, custom fields, dependencies
// (incl. cycle detection), and attachment rows. One throwaway workspace per run.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@/lib/prisma";
import { createWorkspaceFixture, type WorkspaceFixture } from "./fixtures";
import {
  addChecklistItem,
  addTaskAssignee,
  addTaskDependency,
  createAttachment,
  createCustomField,
  createTask,
  deleteAttachment,
  deleteChecklistItem,
  deleteCustomField,
  deleteTask,
  moveTaskToList,
  removeTaskAssignee,
  removeTaskDependency,
  setCustomFieldValue,
  toggleChecklistItem,
  updateTaskDescription,
  updateTaskDueDate,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskTitle,
} from "@/lib/tasks";

let fx: WorkspaceFixture;

before(async () => {
  fx = await createWorkspaceFixture("tasks");
});
after(() => fx.destroy());

describe("createTask", () => {
  test("creates a task, trims the title, and auto-assigns the creator", async () => {
    await createTask(fx.member.id, fx.listA.id, "  Write the spec  ");
    const task = await prisma.task.findFirst({ where: { title: "Write the spec", listId: fx.listA.id }, include: { assignees: true } });
    assert.ok(task);
    assert.equal(task.createdById, fx.member.id);
    assert.deepEqual(task.assignees.map((a) => a.id), [fx.member.id]);
  });

  test("ignores a blank title", async () => {
    const before = await prisma.task.count({ where: { listId: fx.listA.id } });
    await createTask(fx.member.id, fx.listA.id, "   ");
    assert.equal(await prisma.task.count({ where: { listId: fx.listA.id } }), before);
  });

  test("a guest cannot create tasks", async () => {
    await assert.rejects(createTask(fx.guest.id, fx.listA.id, "nope"), /Guests cannot create tasks/);
  });

  test("a member cannot create tasks in a space they don't belong to", async () => {
    await assert.rejects(createTask(fx.member.id, fx.listB.id, "nope"), /Forbidden/);
  });
});

describe("task field updates", () => {
  let taskId: string;
  before(async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Fields", createdById: fx.owner.id } });
    taskId = t.id;
  });

  test("status maps UI keys to DB enums", async () => {
    await updateTaskStatus(fx.member.id, taskId, "review");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.status, "IN_REVIEW");
  });

  test("priority maps UI keys to DB enums", async () => {
    await updateTaskPriority(fx.member.id, taskId, "urgent");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.priority, "URGENT");
  });

  test("due date sets and clears", async () => {
    await updateTaskDueDate(fx.member.id, taskId, "2026-10-01");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.dueDate?.toISOString().slice(0, 10), "2026-10-01");
    await updateTaskDueDate(fx.member.id, taskId, null);
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.dueDate, null);
  });

  test("title trims and rejects blank; description trims to null", async () => {
    await updateTaskTitle(fx.member.id, taskId, "  Renamed  ");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.title, "Renamed");
    await updateTaskTitle(fx.member.id, taskId, "   ");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.title, "Renamed");
    await updateTaskDescription(fx.member.id, taskId, "   ");
    assert.equal((await prisma.task.findUnique({ where: { id: taskId } }))!.description, null);
  });

  test("a guest cannot edit task fields", async () => {
    await assert.rejects(updateTaskStatus(fx.guest.id, taskId, "done"), /Guests cannot edit tasks/);
  });
});

describe("moveTaskToList", () => {
  test("moves within the same space", async () => {
    const list2 = await prisma.list.create({ data: { spaceId: fx.spaceA.id, name: "List A2" } });
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Mover", createdById: fx.owner.id } });
    await moveTaskToList(fx.member.id, t.id, list2.id);
    assert.equal((await prisma.task.findUnique({ where: { id: t.id } }))!.listId, list2.id);
  });

  test("refuses to move a task across spaces", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Stayer", createdById: fx.owner.id } });
    await assert.rejects(moveTaskToList(fx.owner.id, t.id, fx.listB.id), /different space/);
  });
});

describe("assignees", () => {
  test("add/remove an assignee who has space access", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Assign", createdById: fx.owner.id } });
    const title = await addTaskAssignee(fx.member.id, t.id, fx.admin.id);
    assert.equal(title, "Assign");
    let task = await prisma.task.findUnique({ where: { id: t.id }, include: { assignees: true } });
    assert.ok(task!.assignees.some((a) => a.id === fx.admin.id));
    await removeTaskAssignee(fx.member.id, t.id, fx.admin.id);
    task = await prisma.task.findUnique({ where: { id: t.id }, include: { assignees: true } });
    assert.ok(!task!.assignees.some((a) => a.id === fx.admin.id));
  });

  test("cannot assign someone without access to the task's space", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Assign2", createdById: fx.owner.id } });
    await assert.rejects(addTaskAssignee(fx.member.id, t.id, fx.outsider.id), /doesn't have access/);
    await assert.rejects(addTaskAssignee(fx.member.id, t.id, fx.guest.id), /doesn't have access/);
  });
});

describe("checklist items", () => {
  test("add keeps insertion order via position, toggle and delete work", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Checklist", createdById: fx.owner.id } });
    await addChecklistItem(fx.member.id, t.id, "first");
    await addChecklistItem(fx.member.id, t.id, "second");
    await addChecklistItem(fx.member.id, t.id, "  "); // ignored
    const items = await prisma.checklistItem.findMany({ where: { taskId: t.id }, orderBy: { position: "asc" } });
    assert.deepEqual(items.map((i) => i.text), ["first", "second"]);
    assert.deepEqual(items.map((i) => i.position), [0, 1]);

    await toggleChecklistItem(fx.member.id, items[0].id, true);
    assert.equal((await prisma.checklistItem.findUnique({ where: { id: items[0].id } }))!.done, true);

    await deleteChecklistItem(fx.member.id, items[1].id);
    assert.equal(await prisma.checklistItem.count({ where: { taskId: t.id } }), 1);
  });
});

describe("custom fields", () => {
  test("create a dropdown field (options kept), set/clear a value, delete the field", async () => {
    await createCustomField(fx.member.id, fx.listA.id, "Stage", "DROPDOWN", ["Design", "Build", ""]);
    const field = await prisma.customField.findFirst({ where: { listId: fx.listA.id, name: "Stage" } });
    assert.ok(field);
    assert.deepEqual(field.options, ["Design", "Build"]);

    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "CF", createdById: fx.owner.id } });
    await setCustomFieldValue(fx.member.id, t.id, field.id, "Build");
    assert.equal((await prisma.customFieldValue.findFirst({ where: { taskId: t.id, customFieldId: field.id } }))!.value, "Build");

    await setCustomFieldValue(fx.member.id, t.id, field.id, "   "); // clears
    assert.equal(await prisma.customFieldValue.count({ where: { taskId: t.id, customFieldId: field.id } }), 0);

    await deleteCustomField(fx.member.id, field.id);
    assert.equal(await prisma.customField.count({ where: { id: field.id } }), 0);
  });

  test("non-dropdown field stores no options", async () => {
    await createCustomField(fx.member.id, fx.listA.id, "Points", "NUMBER", ["ignored"]);
    const field = await prisma.customField.findFirst({ where: { listId: fx.listA.id, name: "Points" } });
    assert.deepEqual(field!.options, []);
  });

  test("a guest cannot add custom fields", async () => {
    await assert.rejects(createCustomField(fx.guest.id, fx.listA.id, "x", "TEXT", []), /Guests cannot add custom fields/);
  });
});

describe("dependencies", () => {
  test("add a dependency, reject self and cycles, then remove", async () => {
    const [a, b, c] = await Promise.all([
      prisma.task.create({ data: { listId: fx.listA.id, title: "Dep A", createdById: fx.owner.id } }),
      prisma.task.create({ data: { listId: fx.listA.id, title: "Dep B", createdById: fx.owner.id } }),
      prisma.task.create({ data: { listId: fx.listA.id, title: "Dep C", createdById: fx.owner.id } }),
    ]);

    await assert.rejects(addTaskDependency(fx.member.id, a.id, a.id), /can't depend on itself/);

    await addTaskDependency(fx.member.id, a.id, b.id); // a depends on b
    await addTaskDependency(fx.member.id, b.id, c.id); // b depends on c
    assert.equal(await prisma.taskDependency.count({ where: { taskId: a.id, dependsOnId: b.id } }), 1);

    // c depends on a would close the loop a -> b -> c -> a
    await assert.rejects(addTaskDependency(fx.member.id, c.id, a.id), /circular dependency/);

    await removeTaskDependency(fx.member.id, a.id, b.id);
    assert.equal(await prisma.taskDependency.count({ where: { taskId: a.id, dependsOnId: b.id } }), 0);
  });
});

describe("attachments (row layer)", () => {
  test("createAttachment then deleteAttachment returns the freed file's metadata", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Att", createdById: fx.owner.id } });
    await createAttachment(fx.member.id, t.id, { storageKey: "key-123", filename: "notes.txt", mimeType: "text/plain", size: 12 });
    const row = await prisma.attachment.findFirst({ where: { taskId: t.id } });
    assert.ok(row);

    const freed = await deleteAttachment(fx.member.id, row.id);
    assert.equal(freed?.url, "key-123");
    assert.equal(freed?.filename, "notes.txt");
    assert.equal(freed?.workspaceId, fx.workspace.id);
    assert.equal(await prisma.attachment.count({ where: { id: row.id } }), 0);
  });

  test("deleteAttachment on a missing id is a no-op returning null", async () => {
    assert.equal(await deleteAttachment(fx.member.id, "nonexistent"), null);
  });

  test("deleteAttachment ignores a chat attachment (no taskId)", async () => {
    const channel = await prisma.channel.create({ data: { workspaceId: fx.workspace.id, name: "att-chan", members: { connect: [{ id: fx.owner.id }] } } });
    const message = await prisma.message.create({ data: { channelId: channel.id, authorId: fx.owner.id, body: "see file" } });
    const att = await prisma.attachment.create({
      data: { messageId: message.id, url: "chat-key", filename: "chat.txt", mimeType: "text/plain", size: 3, uploadedById: fx.owner.id },
    });
    assert.equal(await deleteAttachment(fx.owner.id, att.id), null);
    assert.equal(await prisma.attachment.count({ where: { id: att.id } }), 1);
  });
});

describe("deleteTask", () => {
  test("removes the task", async () => {
    const t = await prisma.task.create({ data: { listId: fx.listA.id, title: "Doomed", createdById: fx.owner.id } });
    await deleteTask(fx.member.id, t.id);
    assert.equal(await prisma.task.count({ where: { id: t.id } }), 0);
  });

  test("a guest cannot delete a task", async () => {
    await assert.rejects(deleteTask(fx.guest.id, fx.taskA.id), /Guests cannot edit tasks/);
  });
});
