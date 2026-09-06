import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hueFromId,
  statusByDatabaseValue,
  timeAgo,
  toAvatar,
  toDateString,
  toUiCustomField,
  toUiTask,
  type TaskWithRelations,
} from "@/lib/rally-app-data";

test("rally-app-data view helpers", async (t) => {
  await t.test("timeAgo buckets by seconds/minutes/hours/days", () => {
    const now = Date.now();
    assert.equal(timeAgo(new Date(now - 5_000)), "just now");
    assert.equal(timeAgo(new Date(now - 5 * 60_000)), "5m ago");
    assert.equal(timeAgo(new Date(now - 3 * 3_600_000)), "3h ago");
    assert.equal(timeAgo(new Date(now - 2 * 86_400_000)), "2d ago");
  });

  await t.test("toDateString returns YYYY-MM-DD or null", () => {
    assert.equal(toDateString(new Date("2026-09-07T13:45:00Z")), "2026-09-07");
    assert.equal(toDateString(null), null);
  });

  await t.test("hueFromId is deterministic and in range", () => {
    const h = hueFromId("abc123");
    assert.equal(h, hueFromId("abc123"));
    assert.ok(h >= 0 && h < 360);
    assert.notEqual(hueFromId("abc123"), hueFromId("abc124"));
  });

  await t.test("toAvatar derives initials from a name, falls back to email", () => {
    assert.deepEqual(toAvatar({ id: "u1", name: "Jordan Tran", email: "j@x.com" }), {
      id: "u1",
      name: "Jordan Tran",
      initials: "JT",
      hue: hueFromId("u1"),
    });
    const fromEmail = toAvatar({ id: "u2", name: null, email: "sam@x.com" });
    assert.equal(fromEmail.name, "sam@x.com");
    assert.equal(fromEmail.initials, "S");
  });

  await t.test("statusByDatabaseValue maps DB enums to UI keys", () => {
    assert.equal(statusByDatabaseValue.TODO, "todo");
    assert.equal(statusByDatabaseValue.IN_PROGRESS, "in_progress");
    assert.equal(statusByDatabaseValue.IN_REVIEW, "review");
    assert.equal(statusByDatabaseValue.DONE, "done");
  });

  await t.test("toUiCustomField passes through name/type/options", () => {
    assert.deepEqual(toUiCustomField({ id: "f1", name: "Points", type: "NUMBER", options: [] }), {
      id: "f1",
      name: "Points",
      type: "NUMBER",
      options: [],
    });
  });

  await t.test("toUiTask flattens relations into the UI shape", () => {
    const creator = { id: "u1", name: "Owner", email: "o@x.com" };
    const task: TaskWithRelations = {
      id: "t1",
      listId: "l1",
      title: "Ship it",
      description: "  ",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: new Date("2026-09-10T00:00:00Z"),
      assignees: [creator],
      createdBy: creator,
      comments: [{ id: "c1", body: "hi", createdAt: new Date(Date.now() - 30_000), author: creator }],
      attachments: [],
      dependsOn: [{ dependsOn: { id: "t2", title: "Prep", status: "DONE" } }],
      dependents: [],
      checklistItems: [{ id: "ci1", text: "step", done: false }],
      customFieldValues: [{ customFieldId: "f1", value: "3" }],
    };
    const ui = toUiTask(task);
    assert.equal(ui.status, "in_progress");
    assert.equal(ui.priority, "high");
    assert.equal(ui.dueDate, "2026-09-10");
    assert.equal(ui.desc, "  "); // description is passed through as-is
    assert.equal(ui.checklist[0].text, "step");
    assert.deepEqual(ui.customFieldValues, [{ fieldId: "f1", value: "3" }]);
    assert.equal(ui.dependsOn[0].status, "done");
    assert.equal(ui.comments[0].time, "just now");
  });

  await t.test("toUiTask falls back to defaults for unknown enum values and no due date", () => {
    const creator = { id: "u1", name: "Owner", email: "o@x.com" };
    const ui = toUiTask({
      id: "t1",
      listId: "l1",
      title: "x",
      description: null,
      status: "WAT",
      priority: "WAT",
      dueDate: null,
      assignees: [],
      createdBy: creator,
      comments: [],
      attachments: [],
      dependsOn: [],
      dependents: [],
      checklistItems: [],
      customFieldValues: [],
    });
    assert.equal(ui.status, "todo");
    assert.equal(ui.priority, "normal");
    assert.equal(ui.due, "No due date");
    assert.equal(ui.desc, "");
  });
});
