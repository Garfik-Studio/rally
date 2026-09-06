"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled"> & {
  pendingText: string;
};

/** A `<form action={...}>` submit button that disables itself and swaps its
 * label while the action is in flight, via useFormStatus. */
export function SubmitButton({ children, pendingText, style, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending} style={{ ...style, opacity: pending ? 0.6 : style?.opacity, cursor: pending ? "default" : style?.cursor }}>
      {pending ? pendingText : children}
    </button>
  );
}
