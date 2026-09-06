"use client";

import { useState } from "react";
import Link from "next/link";
import type { UiCustomField, UiManageSpace, UiMember } from "@/lib/rally-types";
import { AvatarCircle, MUTED_FG } from "@/app/components/primitives";
import { assignToSpace, createCustomField, deleteCustomField, removeFromSpace } from "@/app/actions";

export function ManageSpace({ space, allMembers, currentUserId }: { space: UiManageSpace; allMembers: UiMember[]; currentUserId: string }) {
  const [addMemberSelection, setAddMemberSelection] = useState("");
  const [fieldFormListId, setFieldFormListId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<UiCustomField["type"]>("TEXT");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [creatingField, setCreatingField] = useState(false);

  const addable = allMembers.filter((m) => !space.members.some((sm) => sm.id === m.id));

  async function handleAddMember() {
    if (!addMemberSelection) return;
    await assignToSpace(space.id, addMemberSelection);
    setAddMemberSelection("");
  }

  async function handleCreateCustomField(listId: string) {
    const name = newFieldName.trim();
    if (!name) return;
    setCreatingField(true);
    try {
      const options = newFieldType === "DROPDOWN" ? newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean) : [];
      await createCustomField(listId, name, newFieldType, options);
      setNewFieldName("");
      setNewFieldOptions("");
      setFieldFormListId(null);
    } finally {
      setCreatingField(false);
    }
  }

  async function handleDeleteCustomField(fieldId: string) {
    if (!confirm("Delete this field? Its values on every task will be removed.")) return;
    await deleteCustomField(fieldId);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
      <Link href="/manage" style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 700, color: "oklch(0.5 0.14 240)", textDecoration: "none" }}>
        &lsaquo; Admin console
      </Link>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{space.name} settings</div>
        <div style={{ fontSize: 12.5, color: MUTED_FG }}>Members and custom fields for this space only.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Members</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {space.members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "oklch(0.96 0.006 60)", borderRadius: 999, padding: "3px 6px 3px 3px" }}>
              <AvatarCircle avatar={m} size={20} fontSize={9} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
              {m.id !== currentUserId && (
                <button onClick={() => removeFromSpace(space.id, m.id)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "oklch(0.5 0.01 60)", padding: "0 2px" }}>
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        {addable.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <select value={addMemberSelection} onChange={(e) => setAddMemberSelection(e.target.value)} style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit" }}>
              <option value="">Add existing member...</option>
              {addable.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button onClick={handleAddMember} disabled={!addMemberSelection} style={{ fontSize: 12.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", cursor: "pointer", opacity: addMemberSelection ? 1 : 0.5 }}>
              Add
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "oklch(0.3 0.01 60)" }}>Custom fields</div>
        {space.lists.map((list) => (
          <div key={list.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {space.lists.length > 1 && <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED_FG }}>{list.name}</div>}
            {list.customFields.map((field) => (
              <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: "1px solid oklch(0.91 0.006 60)", borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{field.name}</div>
                  <div style={{ fontSize: 11, color: MUTED_FG }}>{field.type.toLowerCase()}{field.options.length ? ` · ${field.options.join(", ")}` : ""}</div>
                </div>
                <button onClick={() => handleDeleteCustomField(field.id)} style={{ border: "none", background: "transparent", color: "oklch(0.55 0.16 25)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            ))}
            {list.customFields.length === 0 && fieldFormListId !== list.id && <div style={{ fontSize: 12, color: MUTED_FG }}>No custom fields on this list.</div>}
            {fieldFormListId === list.id ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="Field name" style={{ flex: 1, minWidth: 120, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as UiCustomField["type"])} style={{ border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", fontFamily: "inherit" }}>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="DROPDOWN">Dropdown</option>
                </select>
                {newFieldType === "DROPDOWN" && (
                  <input value={newFieldOptions} onChange={(e) => setNewFieldOptions(e.target.value)} placeholder="Options, comma separated" style={{ flex: 2, minWidth: 180, border: "1px solid oklch(0.88 0.006 60)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                )}
                <button onClick={() => handleCreateCustomField(list.id)} disabled={!newFieldName.trim() || creatingField} style={{ border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "0 14px", borderRadius: 8, cursor: "pointer", opacity: !newFieldName.trim() || creatingField ? 0.6 : 1 }}>
                  Add field
                </button>
                <button onClick={() => setFieldFormListId(null)} style={{ border: "none", background: "transparent", color: MUTED_FG, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setFieldFormListId(list.id)} style={{ alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, color: "oklch(0.68 0.16 35)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                + Add field
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
