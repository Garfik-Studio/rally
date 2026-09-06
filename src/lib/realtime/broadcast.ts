import type { UiMessage } from "@/lib/rally-types";
import { getConnectionsForUser } from "@/lib/realtime/registry";

export type RealtimeEvent = { type: "message"; channelId: string; channelName: string; message: UiMessage };

/** Pushes an event to every open socket belonging to each of the given users, on this process. */
export function broadcastToUsers(userIds: string[], event: RealtimeEvent): void {
  const payload = JSON.stringify(event);
  for (const userId of userIds) {
    for (const socket of getConnectionsForUser(userId)) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  }
}
