import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Best-effort, like the email/Slack sends elsewhere — a logging failure must
// never block the mutation it's describing. Never pass tokens or webhook URLs
// in metadata.
export async function logAudit(entry: {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({ data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue } })
    .catch((err: unknown) => console.error("Failed to write audit log", err));
}
