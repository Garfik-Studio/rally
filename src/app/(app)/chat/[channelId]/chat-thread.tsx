"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UiChannel, UiMessage } from "@/lib/rally-types";
import { AvatarCircle, MentionComposer, MUTED_FG } from "@/app/components/primitives";
import { ChatMessageBody } from "@/app/components/task-card-preview";
import { markChannelRead, postMessage, postMessageWithAttachment } from "@/app/actions";
import { useRealtimeEvents, type RealtimeEvent } from "@/lib/realtime/use-realtime";
import { ALLOWED_ATTACHMENT_MIME_HINT, formatBytes } from "@/lib/attachment-format";

// Keyed by channel.id from the page below, so switching channels mounts a fresh instance
// instead of reusing this one with stale local state (messages, replyingTo, etc).
export function ChatThread({ channel }: { channel: UiChannel }) {
  const [messages, setMessages] = useState<UiMessage[]>(channel.messages);
  const [messageBody, setMessageBody] = useState("");
  const [postingMessage, setPostingMessage] = useState(false);
  const [replyingTo, setReplyingTo] = useState<UiMessage | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markChannelRead(channel.id);
  }, [channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useRealtimeEvents(
    useCallback(
      (event: RealtimeEvent) => {
        if (event.type !== "message" || event.channelId !== channel.id) return;
        const incoming = event.message;
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      },
      [channel.id]
    )
  );

  const rootMessages = messages.filter((m) => !m.parentMessageId);
  const repliesByParent = new Map<string, UiMessage[]>();
  for (const m of messages) {
    if (!m.parentMessageId) continue;
    const list = repliesByParent.get(m.parentMessageId) ?? [];
    list.push(m);
    repliesByParent.set(m.parentMessageId, list);
  }

  async function handleSend() {
    const body = messageBody.trim();
    if ((!body && !pendingFile) || postingMessage) return;
    setPostingMessage(true);
    setSendError(null);
    try {
      if (pendingFile) {
        const formData = new FormData();
        formData.set("body", body);
        formData.set("file", pendingFile);
        if (replyingTo) formData.set("parentMessageId", replyingTo.id);
        await postMessageWithAttachment(channel.id, formData);
      } else {
        await postMessage(channel.id, body, replyingTo?.id);
      }
      setMessageBody("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (replyingTo) setExpandedThreads((s) => new Set(s).add(replyingTo.id));
      setReplyingTo(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Couldn't send message");
    } finally {
      setPostingMessage(false);
    }
  }

  function renderMessage(m: UiMessage, size: number, fontSize: number, nameSize: number, timeSize: number) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: nameSize, fontWeight: 700 }}>{m.author.name}</div>
          <div style={{ fontSize: timeSize, color: "oklch(0.55 0.01 60)" }}>{m.time}</div>
        </div>
        {m.text && <ChatMessageBody text={m.text} />}
        {m.attachment && (
          <a
            href={`/api/attachments/${m.attachment.id}`}
            style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", textDecoration: "none", color: "inherit", maxWidth: 280 }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "oklch(0.93 0.006 60)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>&#128206;</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.attachment.filename}</div>
              <div style={{ fontSize: 11, color: MUTED_FG }}>{formatBytes(m.attachment.size)}</div>
            </div>
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid oklch(0.9 0.006 60)" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{channel.isDirect ? channel.name : "#" + channel.name}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {rootMessages.map((m) => {
          const replies = repliesByParent.get(m.id) ?? [];
          const expanded = expandedThreads.has(m.id);
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <AvatarCircle avatar={m.author} size={28} fontSize={10.5} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                  {renderMessage(m, 28, 13, 13, 11)}
                  <button onClick={() => setReplyingTo(m)} style={{ alignSelf: "flex-start", border: "none", background: "none", fontSize: 11, fontWeight: 700, color: MUTED_FG, cursor: "pointer", padding: 0 }}>
                    Reply
                  </button>
                </div>
              </div>
              {replies.length > 0 && (
                <div style={{ marginLeft: 38, display: "flex", flexDirection: "column", gap: 10, borderLeft: "2px solid oklch(0.92 0.006 60)", paddingLeft: 12 }}>
                  {!expanded ? (
                    <button onClick={() => setExpandedThreads((s) => new Set(s).add(m.id))} style={{ alignSelf: "flex-start", border: "none", background: "none", fontSize: 11.5, fontWeight: 700, color: "oklch(0.68 0.16 35)", cursor: "pointer", padding: 0 }}>
                      {replies.length} {replies.length === 1 ? "reply" : "replies"}
                    </button>
                  ) : (
                    replies.map((r) => (
                      <div key={r.id} style={{ display: "flex", gap: 8 }}>
                        <AvatarCircle avatar={r.author} size={22} fontSize={9} />
                        {renderMessage(r, 22, 12.5, 12.5, 10.5)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {replyingTo && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderTop: "1px solid oklch(0.9 0.006 60)", fontSize: 12, color: MUTED_FG }}>
          Replying to <strong>{replyingTo.author.name}</strong>
          <button onClick={() => setReplyingTo(null)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 14 }}>
            &times;
          </button>
        </div>
      )}
      {pendingFile && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderTop: "1px solid oklch(0.9 0.006 60)", fontSize: 12, color: MUTED_FG }}>
          Attaching <strong>{pendingFile.name}</strong> ({formatBytes(pendingFile.size)})
          <button
            onClick={() => {
              setPendingFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: MUTED_FG, fontSize: 14 }}
          >
            &times;
          </button>
        </div>
      )}
      {sendError && (
        <div style={{ flex: "none", margin: "6px 16px 0", fontSize: 11.5, fontWeight: 600, color: "oklch(0.5 0.18 25)", background: "oklch(0.95 0.05 25)", borderRadius: 8, padding: "6px 8px" }}>{sendError}</div>
      )}
      <div style={{ flex: "none", display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid oklch(0.9 0.006 60)" }}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          title={ALLOWED_ATTACHMENT_MIME_HINT}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file"
          style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer", flex: "none", fontSize: 15 }}
        >
          &#128206;
        </button>
        <MentionComposer
          value={messageBody}
          onChange={setMessageBody}
          candidates={channel.members}
          onEnter={handleSend}
          placeholder={`Message ${channel.isDirect ? channel.name : "#" + channel.name} (@ to mention, Markdown supported)`}
          inputStyle={{ width: "100%", border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit" }}
        />
        <button
          onClick={handleSend}
          disabled={(!messageBody.trim() && !pendingFile) || postingMessage}
          style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontWeight: 700, cursor: (!messageBody.trim() && !pendingFile) || postingMessage ? "default" : "pointer", opacity: (!messageBody.trim() && !pendingFile) || postingMessage ? 0.5 : 1 }}
        >
          &uarr;
        </button>
      </div>
    </div>
  );
}
