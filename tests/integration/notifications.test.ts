// Exercises checkDueDateNotifications (src/app/actions.ts) — the hourly cron
// body that notifies assignees of tasks due today/tomorrow. Assertions are
// scoped to this run's fixture users, since the scan itself is workspace-wide.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@/lib/prisma";
import { checkDueDateNotifications } from "@/app/actions";
import { createWorkspaceFixture, type WorkspaceFixture } from "./fixtures";

let fx: WorkspaceFixture;

// A UTC time firmly inside "today" regardless of when the test runs.
function dueToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

before(async () => {
  fx = await createWorkspaceFixture("notif");
});
after(() => fx.destroy());

describe("checkDueDateNotifications", () => {
  test("notifies each assignee once, and is idempotent on a second run", async () => {
    const task = await prisma.task.create({
      data: {
        listId: fx.listA.id,
        title: "Due soon",
        createdById: fx.owner.id,
        dueDate: dueToday(),
        assignees: { connect: [{ id: fx.member.id }, { id: fx.admin.id }] },
      },
    });

    await checkDueDateNotifications();
    await checkDueDateNotifications(); // dedupe guard: createdAt >= todayStart

    for (const userId of [fx.member.id, fx.admin.id]) {
      const rows = await prisma.notification.findMany({ where: { userId, taskId: task.id } });
      assert.equal(rows.length, 1, `expected exactly one notification for ${userId}`);
      assert.match(rows[0].text, /'Due soon' is due today/);
    }
  });

  test("skips assignees who turned taskDue notifications off", async () => {
    await prisma.user.update({ where: { id: fx.member.id }, data: { notificationPrefs: { taskDue: false } } });
    const task = await prisma.task.create({
      data: {
        listId: fx.listA.id,
        title: "Muted due",
        createdById: fx.owner.id,
        dueDate: dueToday(),
        assignees: { connect: [{ id: fx.member.id }] },
      },
    });

    await checkDueDateNotifications();
    assert.equal(await prisma.notification.count({ where: { userId: fx.member.id, taskId: task.id } }), 0);
    await prisma.user.update({ where: { id: fx.member.id }, data: { notificationPrefs: {} } });
  });

  test("ignores tasks that are already DONE", async () => {
    const task = await prisma.task.create({
      data: {
        listId: fx.listA.id,
        title: "Finished",
        createdById: fx.owner.id,
        status: "DONE",
        dueDate: dueToday(),
        assignees: { connect: [{ id: fx.admin.id }] },
      },
    });

    await checkDueDateNotifications();
    assert.equal(await prisma.notification.count({ where: { userId: fx.admin.id, taskId: task.id } }), 0);
  });
});
