// Exercises the read-path loaders in src/lib/rally-app-data.ts that back the
// board, chat, and admin-console pages. They take a `viewer` object directly
// (no auth() call), so they're testable against a fixture workspace.
import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@/lib/prisma";
import { loadChannel, loadManageData, loadTaskBoard } from "@/lib/rally-app-data";
import { createWorkspaceFixture, type WorkspaceFixture } from "./fixtures";

let fx: WorkspaceFixture;
const viewer = (u: { id: string; name: string | null; email: string }) => ({ id: u.id, name: u.name, email: u.email });

before(async () => {
  fx = await createWorkspaceFixture("loaders");
});
after(() => fx.destroy());

describe("loadTaskBoard", () => {
  test("owner can open any space in the workspace", async () => {
    const board = await loadTaskBoard(viewer(fx.owner), fx.spaceB.id);
    assert.ok(board);
    assert.equal(board.space.name, "Space B");
  });

  test("member sees a space they belong to, with the owner folded into members", async () => {
    const board = await loadTaskBoard(viewer(fx.member), fx.spaceA.id);
    assert.ok(board);
    assert.ok(board.space.members.some((m) => m.id === fx.owner.id));
    assert.ok(board.space.members.some((m) => m.id === fx.member.id));
    assert.ok(board.space.lists.some((l) => l.id === fx.listA.id));
  });

  test("member gets null for a space they don't belong to", async () => {
    assert.equal(await loadTaskBoard(viewer(fx.member), fx.spaceB.id), null);
  });

  test("guest gets null (no board access at all)", async () => {
    assert.equal(await loadTaskBoard(viewer(fx.guest), fx.spaceA.id), null);
  });
});

describe("loadChannel", () => {
  let channelId: string;
  before(async () => {
    const channel = await prisma.channel.create({
      data: {
        workspaceId: fx.workspace.id,
        name: "general",
        members: { connect: [{ id: fx.owner.id }, { id: fx.member.id }] },
      },
    });
    channelId = channel.id;
    await prisma.message.create({ data: { channelId, authorId: fx.owner.id, body: "hello team" } });
    await prisma.message.create({ data: { channelId, authorId: fx.member.id, body: "hi" } });
    await prisma.message.create({
      data: {
        channelId,
        authorId: fx.member.id,
        body: "file for you",
        attachments: { create: { url: "chan-key", filename: "spec.pdf", mimeType: "application/pdf", size: 9, uploadedById: fx.member.id } },
      },
    });
  });

  test("a member sees the message history and unread count of others' messages", async () => {
    const channel = await loadChannel(viewer(fx.member), channelId);
    assert.ok(channel);
    assert.equal(channel.name, "general");
    assert.deepEqual(channel.messages.map((m) => m.text), ["hello team", "hi", "file for you"]);
    assert.equal(channel.unread, 1); // owner's message, unread by member
  });

  test("a message's attachment is surfaced on the loaded channel", async () => {
    const channel = await loadChannel(viewer(fx.member), channelId);
    const withFile = channel!.messages.find((m) => m.text === "file for you");
    assert.equal(withFile?.attachment?.filename, "spec.pdf");
    assert.equal(withFile?.attachment?.uploadedBy.id, fx.member.id);
    assert.equal(channel!.messages.find((m) => m.text === "hi")?.attachment, null);
  });

  test("a non-member gets null", async () => {
    assert.equal(await loadChannel(viewer(fx.admin), channelId), null);
  });
});

describe("loadManageData", () => {
  test("member and guest get null", async () => {
    assert.equal(await loadManageData(viewer(fx.member)), null);
    assert.equal(await loadManageData(viewer(fx.guest)), null);
  });

  test("admin sees only spaces they manage and no slack webhook", async () => {
    const data = await loadManageData(viewer(fx.admin));
    assert.ok(data);
    assert.deepEqual(data.spaces.map((s) => s.id), [fx.spaceA.id]);
    assert.equal(data.slackWebhookUrl, null);
  });

  test("owner sees every space, all pending invites, and the slack webhook slot", async () => {
    await prisma.workspace.update({ where: { id: fx.workspace.id }, data: { slackWebhookUrl: "https://hooks.slack.com/services/x" } });
    await prisma.invite.create({
      data: {
        email: `pending-${Date.now()}@rally.test`,
        role: "MEMBER",
        token: `tok-${Date.now()}`,
        workspaceId: fx.workspace.id,
        invitedById: fx.owner.id,
        spaceId: fx.spaceA.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const data = await loadManageData(viewer(fx.owner));
    assert.ok(data);
    assert.deepEqual(
      data.spaces.map((s) => s.id).sort(),
      [fx.spaceA.id, fx.spaceB.id].sort()
    );
    assert.ok(data.pendingInvites.length >= 1);
    assert.equal(data.slackWebhookUrl, "https://hooks.slack.com/services/x");
  });
});
