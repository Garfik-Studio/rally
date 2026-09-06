// Exercises the invite-acceptance flow (acceptInvite in src/app/actions.ts) —
// the one onboarding path that runs without an authenticated session. Covers
// token validation, new vs. existing user, and the membership/space/guest-share
// rows an accepted invite creates.
import "dotenv/config";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { acceptInvite } from "@/app/actions";
import { createWorkspaceFixture, type WorkspaceFixture } from "./fixtures";

let fx: WorkspaceFixture;
const createdUserIds: string[] = [];

// acceptInvite ends with revalidatePath("/"), which throws "static generation
// store missing" outside a Next request context. All DB writes are done by
// then, so swallow only that invariant and let every other error propagate.
async function accept(input: Parameters<typeof acceptInvite>[0]) {
  try {
    await acceptInvite(input);
  } catch (err) {
    if (err instanceof Error && err.message.includes("static generation store missing")) return;
    throw err;
  }
}

type InviteOverrides = {
  email: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  spaceId?: string;
  listId?: string;
  expiresAt?: Date;
  acceptedAt?: Date | null;
};

function makeInvite(data: InviteOverrides) {
  return prisma.invite.create({
    data: {
      role: "MEMBER",
      token: crypto.randomBytes(16).toString("hex"),
      workspaceId: fx.workspace.id,
      invitedById: fx.owner.id,
      expiresAt: new Date(Date.now() + 60_000),
      ...data,
    },
  });
}

before(async () => {
  fx = await createWorkspaceFixture("invite");
});
after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await fx.destroy();
});

describe("acceptInvite validation", () => {
  test("rejects an unknown token", async () => {
    await assert.rejects(accept({ token: "nope", name: "X", password: "Tr0ubl3-Kayak!" }), /invalid/i);
  });

  test("rejects an expired invite", async () => {
    const invite = await makeInvite({ email: `expired-${Date.now()}@rally.test`, expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(accept({ token: invite.token, name: "X", password: "Tr0ubl3-Kayak!" }), /expired/i);
  });

  test("rejects an already-accepted invite", async () => {
    const invite = await makeInvite({ email: `used-${Date.now()}@rally.test`, acceptedAt: new Date() });
    await assert.rejects(accept({ token: invite.token, name: "X", password: "Tr0ubl3-Kayak!" }), /already been used/i);
  });

  test("enforces the password policy for a brand-new user", async () => {
    const invite = await makeInvite({ email: `weak-${Date.now()}@rally.test` });
    await assert.rejects(accept({ token: invite.token, name: "X", password: "password1" }), /too common/i);
  });
});

describe("acceptInvite for a new user", () => {
  test("creates the account, hashes the password, and adds a workspace membership", async () => {
    const email = `newbie-${Date.now()}@rally.test`;
    const invite = await makeInvite({ email, role: "ADMIN", spaceId: fx.spaceB.id });
    await accept({ token: invite.token, name: "  Newbie  ", password: "Tr0ubl3-Kayak!" });

    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user);
    createdUserIds.push(user.id);
    assert.equal(user.name, "Newbie");
    assert.ok(user.passwordHash && (await bcrypt.compare("Tr0ubl3-Kayak!", user.passwordHash)));

    const membership = await prisma.userMembership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: fx.workspace.id } },
    });
    assert.equal(membership?.role, "ADMIN");

    // spaceId on the invite creates a SpaceMember row
    assert.equal(await prisma.spaceMember.count({ where: { userId: user.id, spaceId: fx.spaceB.id } }), 1);

    // the invite is marked accepted and an audit row is written
    assert.ok((await prisma.invite.findUnique({ where: { id: invite.id } }))!.acceptedAt);
    assert.equal(
      await prisma.auditLog.count({ where: { workspaceId: fx.workspace.id, action: "invite.accepted", targetId: invite.id } }),
      1
    );
  });

  test("a GUEST invite creates a GuestShare for the target list, not a SpaceMember", async () => {
    const email = `guest-${Date.now()}@rally.test`;
    const invite = await makeInvite({ email, role: "GUEST", listId: fx.listA.id });
    await accept({ token: invite.token, name: "Guesty", password: "Tr0ubl3-Kayak!" });

    const user = await prisma.user.findUnique({ where: { email } });
    createdUserIds.push(user!.id);
    assert.equal(await prisma.guestShare.count({ where: { userId: user!.id, listId: fx.listA.id } }), 1);
    assert.equal(await prisma.spaceMember.count({ where: { userId: user!.id } }), 0);
  });
});

describe("acceptInvite for an existing user", () => {
  test("adds the membership without touching the existing password", async () => {
    const email = `existing-${Date.now()}@rally.test`;
    const original = await bcrypt.hash("Original-Pass-1!", 10);
    const user = await prisma.user.create({ data: { email, name: "Existing", passwordHash: original } });
    createdUserIds.push(user.id);

    const invite = await makeInvite({ email, role: "MEMBER", spaceId: fx.spaceA.id });
    // password arg is ignored for an existing user — even a weak one is fine
    await accept({ token: invite.token, name: "Existing", password: "x" });

    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(refreshed!.passwordHash, original);
    assert.equal(
      (await prisma.userMembership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: fx.workspace.id } },
      }))?.role,
      "MEMBER"
    );
  });
});
