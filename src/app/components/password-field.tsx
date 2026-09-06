"use client";

import { useId, useState } from "react";
import { scorePassword } from "@/lib/password-strength";

const BORDER = "oklch(0.9 0.006 60)";
const MUTED = "oklch(0.5 0.01 60)";

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.4 20.4 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a20.4 20.4 0 0 1-2.68 3.68" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password `<input>` with a show/hide toggle. Forwards every other input prop, controlled or not. */
export function PasswordInput({ style, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input
        {...rest}
        type={visible ? "text" : "password"}
        suppressHydrationWarning
        style={{
          fontSize: 14,
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          outline: "none",
          fontFamily: "inherit",
          width: "100%",
          boxSizing: "border-box",
          paddingRight: 36,
          ...style,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          color: MUTED,
        }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

const SCORE_COLORS = ["oklch(0.55 0.2 25)", "oklch(0.6 0.18 45)", "oklch(0.65 0.14 85)", "oklch(0.6 0.14 145)", "oklch(0.55 0.15 150)"];

/** Live strength feedback for a password being set. The definitive checks (common-password
 * list, exact similarity) run server-side in password-policy.ts and surface on submit. */
export function PasswordStrengthMeter({ password, attributes = [] }: { password: string; attributes?: string[] }) {
  const id = useId();
  if (!password) return null;
  const { score, label, hints } = scorePassword(password, attributes);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }} aria-live="polite">
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={`${id}-${i}`}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              background: i <= score ? SCORE_COLORS[score] : BORDER,
            }}
          />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        {label}
        {hints.length > 0 && ` — ${hints.join(", ")}`}
      </p>
    </div>
  );
}
