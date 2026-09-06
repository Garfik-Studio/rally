"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import type { RealtimeEvent } from "@/lib/realtime/broadcast";

export type { RealtimeEvent };

type Listener = (event: RealtimeEvent) => void;

const RealtimeContext = createContext<{ subscribe: (fn: Listener) => () => void } | null>(null);

/**
 * Opens one WebSocket per browser tab (cookies ride along automatically, same-origin) and
 * fans incoming events out to any subscriber via context, instead of every page opening its
 * own connection. Reconnects with backoff on drop; never polls on a timer.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<Listener>());

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${proto}//${window.location.host}/ws`);
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (raw) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(raw.data as string) as RealtimeEvent;
        } catch {
          return;
        }
        for (const listener of listenersRef.current) listener(event);
      };
      socket.onclose = () => {
        if (stopped) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  return <RealtimeContext.Provider value={{ subscribe }}>{children}</RealtimeContext.Provider>;
}

/** Runs `onEvent` for every realtime event while mounted. Pass a stable (useCallback'd) function. */
export function useRealtimeEvents(onEvent: Listener) {
  const ctx = useContext(RealtimeContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(onEvent);
  }, [ctx, onEvent]);
}
