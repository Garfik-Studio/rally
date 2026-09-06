import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireListAccess } from "@/lib/access";
import { readAttachmentFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: { url: true, filename: true, mimeType: true, task: { select: { listId: true } }, message: { select: { channel: { select: { workspaceId: true, members: { select: { id: true } } } } } } },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  let workspaceId: string;
  try {
    if (attachment.task) {
      workspaceId = (await requireListAccess(session.user.id, attachment.task.listId)).workspaceId;
    } else if (attachment.message) {
      if (!attachment.message.channel.members.some((m) => m.id === session.user.id)) throw new Error("Forbidden");
      workspaceId = attachment.message.channel.workspaceId;
    } else {
      throw new Error("Orphaned attachment");
    }
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await logAudit({ workspaceId, actorId: session.user.id, action: "attachment.accessed", targetType: "attachment", targetId: id });

  const buffer = await readAttachmentFile(attachment.url);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
