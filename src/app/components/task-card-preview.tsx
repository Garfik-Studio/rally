"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StatusKey } from "@/lib/rally-types";
import { getTaskPreviews, type TaskPreview } from "@/app/actions";
import { Markdown, STATUSES } from "./primitives";

const TASK_LINK_RE = /\?task=([a-zA-Z0-9]+)/;

function TaskCard({ task, onOpen }: { task: { title: string; status: StatusKey }; onOpen: () => void }) {
  const statusInfo = STATUSES.find((s) => s.key === task.status) ?? STATUSES[0];
  return (
    <button
      onClick={onOpen}
      style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 10, padding: "10px 12px", background: "oklch(0.985 0.004 60)", cursor: "pointer", width: "100%", maxWidth: 320, fontFamily: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusInfo.color, flex: "none" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.5 0.01 60)" }}>{statusInfo.label}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.22 0.01 60)" }}>{task.title}</div>
    </button>
  );
}

/** Every chat message's text run through here once, so a pasted task link (`?task=<id>`)
 * unfurls into a live TaskCard instead of a raw URL. Previews are looked up lazily and cached
 * for the lifetime of the chat page — this is the only cross-space task data chat ever needs. */
export function ChatMessageBody({ text }: { text: string }) {
  const router = useRouter();
  const [previews, setPreviews] = useState<Map<string, TaskPreview>>(new Map());
  const match = text.match(TASK_LINK_RE);
  const taskId = match?.[1];

  useEffect(() => {
    if (!taskId || previews.has(taskId)) return;
    let cancelled = false;
    getTaskPreviews([taskId]).then((results) => {
      if (cancelled || results.length === 0) return;
      setPreviews((prev) => new Map(prev).set(results[0].id, results[0]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const task = taskId ? previews.get(taskId) : undefined;
  if (!match || !task) return <Markdown text={text} />;

  const remaining = text
    .split(/\s+/)
    .filter((word) => !word.includes(match[0]))
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {remaining && <Markdown text={remaining} />}
      <TaskCard task={task} onOpen={() => router.push(`/space/${task.spaceId}?task=${task.id}`)} />
    </div>
  );
}
