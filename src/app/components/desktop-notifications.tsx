"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealtimeEvents, type RealtimeEvent } from "@/lib/realtime/use-realtime";

/**
 * Fires a desktop Notification for an incoming chat message the viewer isn't already looking
 * at. Delivery is push-based (the WebSocket tells us the instant a message lands), so there's
 * no polling here — just a listener. Only works while this tab is open (foreground or
 * background); notifications after the browser is fully closed need Web Push + a service
 * worker, a separate feature not built here.
 */
export function DesktopNotificationBridge({ currentUserId, enabled }: { currentUserId: string; enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type !== "message") return;
      if (event.message.author.id === currentUserId) return;
      const viewingThisChannel = pathname === `/chat/${event.channelId}`;
      if (viewingThisChannel && !document.hidden) return;
      if (!enabled || typeof window === "undefined" || typeof Notification === "undefined" || Notification.permission !== "granted") return;

      const notification = new Notification(`${event.message.author.name} in ${event.channelName}`, {
        body: event.message.text || (event.message.attachment ? `Sent ${event.message.attachment.filename}` : "New message"),
      });
      notification.onclick = () => {
        window.focus();
        router.push(`/chat/${event.channelId}`);
      };
    },
    [currentUserId, enabled, pathname, router]
  );

  useRealtimeEvents(handleEvent);
  return null;
}
