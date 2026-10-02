import { useId } from "react";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";
import { titleCaseText } from "../formatters.js";

export default function DischargeDialog({ admission, onCancel, onConfirm, confirming }) {
  const titleId = useId();

  function handleBackdrop() {
    if (!confirming) onCancel();
  }

  return (
    <ModalShell
      labelledById={titleId}
      overlayClassName="ct-modal-overlay ct-modal-overlay--dark"
      overlayStyle={{ zIndex: 300 }}
      className="ct-modal ct-modal--narrow"
      onBackdropClick={handleBackdrop}
      style={{ maxWidth: 380, padding: "32px 28px", textAlign: "center" }}
    >
      <div style={{ fontSize: 40, marginBottom: 12, color: C.red, fontWeight: 900, lineHeight: 1 }} aria-hidden="true">
        DC
      </div>
      <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20, marginBottom: 8 }}>
        Discharge Patient?
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
        {titleCaseText(admission.last)}, {titleCaseText(admission.first)}
      </div>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        This will remove the patient from the active census.<br />All pending tasks will be cancelled.
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={confirming} onClick={onCancel} style={{ flex: 1, padding: 11, border: `1.5px solid ${C.border}`, borderRadius: 9, background: C.surface, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: confirming ? "default" : "pointer", color: C.muted }}>
          Cancel
        </button>
        <button type="button" disabled={confirming} onClick={onConfirm} style={{ flex: 1, padding: 11, background: confirming ? C.muted : C.red, color: "#fff", border: "none", borderRadius: 9, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: confirming ? "default" : "pointer" }}>
          {confirming ? "Discharging…" : "Confirm Discharge"}
        </button>
      </div>
    </ModalShell>
  );
}
