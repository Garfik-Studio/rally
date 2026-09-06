import type { PriorityKey, StatusKey, UiAvatar } from "@/lib/rally-types";
import { AvatarCircle } from "./primitives";

export const PRIORITY: Record<PriorityKey, { label: string; bg: string; fg: string }> = {
  urgent: { label: "Urgent", bg: "oklch(0.6 0.19 25)", fg: "#fff" },
  high: { label: "High", bg: "oklch(0.88 0.14 70)", fg: "oklch(0.35 0.1 70)" },
  normal: { label: "Normal", bg: "oklch(0.9 0.05 240)", fg: "oklch(0.35 0.08 240)" },
  low: { label: "Low", bg: "oklch(0.92 0.01 60)", fg: "oklch(0.45 0.01 60)" },
};

export function isOverdue(task: { dueDate: string | null; status: StatusKey }): boolean {
  if (!task.dueDate || task.status === "done") return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

/** Overlapping avatar stack for multi-assignee display; shows a dashed placeholder when unassigned. */
export function AvatarStack({ avatars, size, fontSize }: { avatars: UiAvatar[]; size: number; fontSize: number }) {
  if (avatars.length === 0) {
    return <div style={{ width: size, height: size, borderRadius: "50%", border: "1.5px dashed oklch(0.8 0.006 60)", flex: "none" }} />;
  }
  const shown = avatars.slice(0, 3);
  const extra = avatars.length - shown.length;
  const overlap = Math.round(size * 0.35);
  return (
    <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
      {shown.map((a, i) => (
        <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -overlap, borderRadius: "50%", border: "2px solid #fff" }}>
          <AvatarCircle avatar={a} size={size} fontSize={fontSize} />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -overlap,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "oklch(0.88 0.006 60)",
            color: "oklch(0.4 0.01 60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(8, fontSize - 1),
            fontWeight: 700,
            border: "2px solid #fff",
            flex: "none",
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
