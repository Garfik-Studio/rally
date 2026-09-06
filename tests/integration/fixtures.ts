// Shared throwaway-workspace fixture for the integration suites. Each call makes
// one isolated workspace (unique slug) with an owner + one admin/member/guest,
// two spaces, a list per space, and one task on list A. `destroy()` drops the
// workspace (cascades everything under it) and the users.
import { prisma } from "@/lib/prisma";

export type WorkspaceFixture = Awaited<ReturnType<typeof createWorkspaceFixture>>;

export async function createWorkspaceFixture(label = "fix") {
  const stamp = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspace = await prisma.workspace.create({ data: { name: `WS ${stamp}`, slug: `ws-${stamp}` } });

  const [owner, admin, member, guest, outsider] = await Promise.all(
    ["owner", "admin", "member", "guest", "outsider"].map((role) =>
      prisma.user.create({ data: { email: `${role}-${stamp}@rally.test`, name: role } })
    )
  );

  await prisma.userMembership.createMany({
    data: [
      { userId: owner.id, workspaceId: workspace.id, role: "OWNER" },
      { userId: admin.id, workspaceId: workspace.id, role: "ADMIN" },
      { userId: member.id, workspaceId: workspace.id, role: "MEMBER" },
      { userId: guest.id, workspaceId: workspace.id, role: "GUEST" },
    ],
  });

  const [spaceA, spaceB] = await Promise.all([
    prisma.space.create({ data: { workspaceId: workspace.id, name: "Space A" } }),
    prisma.space.create({ data: { workspaceId: workspace.id, name: "Space B" } }),
  ]);

  await prisma.spaceMember.createMany({
    data: [
      { userId: admin.id, spaceId: spaceA.id },
      { userId: member.id, spaceId: spaceA.id },
    ],
  });

  const [listA, listB] = await Promise.all([
    prisma.list.create({ data: { spaceId: spaceA.id, name: "List A" } }),
    prisma.list.create({ data: { spaceId: spaceB.id, name: "List B" } }),
  ]);

  await prisma.guestShare.create({ data: { workspaceId: workspace.id, userId: guest.id, listId: listA.id } });

  const taskA = await prisma.task.create({ data: { listId: listA.id, title: "Task A", createdById: owner.id } });

  const userIds = [owner.id, admin.id, member.id, guest.id, outsider.id];

  return {
    workspace,
    owner,
    admin,
    member,
    guest,
    outsider,
    spaceA,
    spaceB,
    listA,
    listB,
    taskA,
    async destroy() {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}
