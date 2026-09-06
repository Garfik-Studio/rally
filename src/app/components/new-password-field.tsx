"use client";

import { useState } from "react";
import { PasswordInput, PasswordStrengthMeter } from "@/app/components/password-field";

/** A password input for *setting* a new password: show/hide toggle plus a live strength meter.
 * The authoritative checks (common-password list, exact similarity) run server-side in
 * password-policy.ts when the form is submitted. */
export function NewPasswordField({
  name,
  placeholder,
  attributes,
}: {
  name: string;
  placeholder?: string;
  attributes?: string[];
}) {
  const [value, setValue] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <PasswordInput
        name={name}
        required
        minLength={8}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <PasswordStrengthMeter password={value} attributes={attributes} />
    </div>
  );
}
