import { useId, useState } from "react";
import Label from "./Label.jsx";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

export default function AdmissionModal({ admission, onSave, onClose }) {
  const titleId = useId();
  const empty = { last: "", first: "", dob: "", room: "", arrival: "", dx: "", notes: "", status: "pending", physician: "", location: "" };

  const [form, setForm] = useState(admission ? { ...admission } : empty);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const iStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 13,
    background: C.bg,
    outline: "none",
    boxSizing: "border-box",
  };

  let fieldIndex = 0;
  function field(label, key, type = "text", placeholder = "") {
    const fid = `${titleId}-f-${fieldIndex++}`;
    return (
      <div style={{ marginBottom: 14 }}>
        <Label htmlFor={fid}>{label}</Label>
        <input id={fid} type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} style={iStyle} />
      </div>
    );
  }

  async function save() {
    if (!form.last.trim() || !form.first.trim() || !form.dob) {
      setErr("Last name, first name, and DOB are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message || "Could not save admission.");
    } finally {
      setSaving(false);
    }
  }

  const notesFieldId = `${titleId}-notes`;
  const statusFieldId = `${titleId}-status`;

  function handleBackdropClose() {
    if (!saving) onClose();
  }

  return (
    <ModalShell labelledById={titleId} onBackdropClick={handleBackdropClose} className="ct-modal">
      <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>
          {admission ? "Edit Admission" : "New Admission"}
        </div>
        <button type="button" disabled={saving} aria-label="Close admission form" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: saving ? "default" : "pointer", fontSize: 16, color: C.muted }}>
          <span aria-hidden="true">X</span>
        </button>
      </div>
      <div className="ct-modal__body" style={{ padding: "16px 20px" }}>
        {field("Last Name *", "last", "text", "Last name")}
        {field("First Name *", "first", "text", "First name")}
        {field("Date of Birth *", "dob", "date")}
        {field("Room", "room", "text", "e.g. 214-A")}
        {field("Est. Arrival", "arrival", "datetime-local")}
        {field("Diagnosis / Condition", "dx", "text", "Primary reason for admission")}
        {field("Attending Physician", "physician", "text", "e.g. Dr. Smith")}
        {field("Facility / Location", "location", "text", "e.g. Sunrise Care Center")}
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor={notesFieldId}>Clinical Notes</Label>
          <textarea id={notesFieldId} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Relevant history, precautions, special needs..." style={{ ...iStyle, minHeight: 72, resize: "vertical" }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor={statusFieldId}>Status</Label>
          <select id={statusFieldId} value={form.status} onChange={(e) => set("status", e.target.value)} style={iStyle}>
            <option value="pending">Pending</option>
            <option value="inhouse">In House</option>
          </select>
        </div>
        {err && (
          <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }} role="alert">
            {err}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0, background: C.surface }}>
        <button type="button" disabled={saving} onClick={onClose} style={{ flex: 1, padding: "11px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.surface, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", color: C.muted }}>
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={save} style={{ flex: 2, padding: "11px", background: saving ? C.muted : C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving…" : "Save Admission"}
        </button>
      </div>
    </ModalShell>
  );
}
