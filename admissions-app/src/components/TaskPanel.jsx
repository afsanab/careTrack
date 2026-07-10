import { useId, useState } from "react";
import { fmtDate } from "../formatters.js";
import Label from "./Label.jsx";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

export default function TaskPanel({ admission, activeTasks, onClose, onAssign, onComplete, onUpdateNote, role }) {
  const titleId = useId();
  const noteFieldId = useId();

  const [activeId, setActiveId] = useState(activeTasks[0]?.id || null);
  const [busy, setBusy] = useState(false);

  const task = activeTasks.find((t) => t.id === activeId);
  const isAdmin = role === "admin";
  const isPhysician = role === "physician";
  const daysUntilDue = task ? Math.ceil((task.dueDate - Date.now()) / 86400000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

  async function runMutation(fn) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell labelledById={titleId} overlayClassName="ct-modal-overlay ct-modal-overlay--dark" className="ct-modal ct-modal--wide" onBackdropClick={onClose}>
      <div style={{ background: C.navy, padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div id={titleId} style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            Clinical Tasks
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
            {admission.last}, {admission.first}
          </div>
        </div>
        <button type="button" aria-label="Close task panel" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", cursor: "pointer", fontSize: 16, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span aria-hidden="true">X</span>
        </button>
      </div>

      <div style={{ background: "#f0ede8", borderBottom: `2px solid ${C.border}`, overflowX: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", minWidth: "max-content" }}>
          {activeTasks.map((t) => {
            const isActive = t.id === activeId;
            const due = Math.ceil((t.dueDate - Date.now()) / 86400000);
            const over = due < 0;
            const soon = due >= 0 && due <= 3;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                style={{
                  padding: "12px 18px",
                  border: "none",
                  borderBottom: `3px solid ${isActive ? C.blue : "transparent"}`,
                  background: isActive ? C.surface : "transparent",
                  color: isActive ? C.blue : C.muted,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  marginBottom: -2,
                  minWidth: 80,
                  flexShrink: 0,
                }}
              >
                <span>{t.label}</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: over ? C.red : soon ? C.yellow : C.light }}>
                  {t.status === "completed" ? "Done" : over ? `${Math.abs(due)}d overdue` : due === 0 ? "Due today" : `${due}d left`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {task ? (
          <div style={{ padding: 24 }}>
            <div
              style={{
                borderRadius: 14,
                padding: "18px 20px",
                marginBottom: 20,
                background:
                  task.status === "completed" ? C.greenLight : isOverdue ? "#fff0ee" : isDueSoon ? "#fffbf0" : C.yellowLight,
                border: `2px solid ${task.status === "completed" ? C.greenBorder : isOverdue ? C.red : isDueSoon ? C.yellow : C.yellowBorder}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    background: task.status === "completed" ? C.green : isOverdue ? C.red : isDueSoon ? C.yellow : C.yellowBorder,
                    color: "#fff",
                  }}
                  aria-hidden="true"
                >
                  {task.status === "completed" ? "OK" : isOverdue ? "!" : isDueSoon ? "!" : "--"}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 16,
                      color: task.status === "completed" ? C.green : isOverdue ? C.red : isDueSoon ? "#a06000" : "#7a4f08",
                      marginBottom: 4,
                    }}
                  >
                    {task.status === "completed"
                      ? "Completed"
                      : isOverdue
                        ? `OVERDUE — ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? "s" : ""} past due`
                        : daysUntilDue === 0
                          ? "Due Today!"
                          : isDueSoon
                            ? `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`
                            : task.assignedAt
                              ? "Assigned — Awaiting Physician"
                              : "Not Yet Assigned"}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                    Due: <strong>{fmtDate(task.dueDate)}</strong>
                    {task.assignedAt && !task.completedAt && <span> · Assigned {fmtDate(task.assignedAt)}</span>}
                    {task.completedAt && (
                      <span>
                        {" "}
                        · Completed {fmtDate(task.completedAt)} by {task.completedBy}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <Label htmlFor={noteFieldId}>{isAdmin ? "Instructions for Physician" : `${task.label} Notes`}</Label>
              <textarea
                id={noteFieldId}
                value={task.note}
                onChange={(e) => void onUpdateNote(admission.id, task.id, e.target.value)}
                disabled={task.status === "completed" && isPhysician}
                placeholder={isAdmin ? `Add instructions for the ${task.label}...` : task.note ? "" : "No instructions yet."}
                style={{
                  width: "100%",
                  padding: "11px 13px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontSize: 13,
                  background: task.status === "completed" ? "#f4f1ec" : C.bg,
                  outline: "none",
                  minHeight: 90,
                  resize: "vertical",
                  boxSizing: "border-box",
                  color: C.text,
                  lineHeight: 1.6,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              {isAdmin && task.status !== "completed" && !task.assignedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runMutation(() => onAssign(admission.id, task.id, false))}
                  style={{
                    flex: 1,
                    padding: "13px 16px",
                    background: C.yellow,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.7 : 1,
                    letterSpacing: "0.01em",
                  }}
                >
                  {busy ? "Working…" : "Assign to Physician"}
                </button>
              )}
              {isAdmin && task.status !== "completed" && task.assignedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runMutation(() => onAssign(admission.id, task.id, true))}
                  style={{ padding: "13px 16px", background: C.redLight, color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? "Working…" : "Unassign"}
                </button>
              )}
              {isPhysician && task.assignedAt && task.status !== "completed" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runMutation(() => onComplete(admission.id, task.id))}
                  style={{
                    flex: 1,
                    padding: "13px 16px",
                    background: C.green,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? "Working…" : "Mark Complete"}
                </button>
              )}
              {isPhysician && !task.assignedAt && task.status !== "completed" && (
                <div style={{ flex: 1, padding: "13px 16px", background: "#f4f1ec", color: C.light, borderRadius: 10, fontSize: 13, textAlign: "center", border: `1.5px solid ${C.border}` }}>
                  Awaiting assignment from admissions
                </div>
              )}
              {task.status === "completed" && (
                <div style={{ flex: 1, padding: "13px 16px", background: C.greenLight, color: C.green, borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: "center", border: `1.5px solid ${C.greenBorder}` }}>
                  Completed by {task.completedBy}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: C.light, fontSize: 13 }}>No tasks yet.</div>
        )}
      </div>
    </ModalShell>
  );
}
