import { fmtAge, fmtArrival, formatPhysicianDisplay, titleCaseText } from "../formatters.js";
import TaskPills from "./TaskPills.jsx";
import { C } from "../theme/colors.js";

export default function AdmissionCard({
  admission,
  activeTasks,
  canEdit,
  onEdit,
  onDelete,
  onPromote,
  onDischarge,
  onOpenTasks,
  patientBusy,
}) {
  const isPending = admission.status === "pending";
  const openTasks = activeTasks ? activeTasks.filter((t) => t.assignedAt && t.status !== "completed") : [];
  const overdueTasks = activeTasks
    ? activeTasks.filter((t) => t.status !== "completed" && Math.ceil((t.dueDate - Date.now()) / 86400000) < 0)
    : [];
  const hasUrgent =
    overdueTasks.length > 0 ||
    activeTasks?.some((t) => {
      const d = Math.ceil((t.dueDate - Date.now()) / 86400000);
      return t.status !== "completed" && d >= 0 && d <= 3;
    });

  const borderColor = isPending ? C.yellowBorder : hasUrgent ? C.red : C.greenBorder;
  const headerBg = isPending ? C.yellowLight : hasUrgent ? "#fff0ee" : C.greenLight;
  const badgeBg = isPending ? C.yellow : C.green;

  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 14,
        border: `2px solid ${borderColor}`,
        boxShadow: hasUrgent ? `0 0 0 3px rgba(192,57,43,0.15), 0 2px 8px rgba(0,0,0,0.08)` : "0 1px 4px rgba(0,0,0,0.07)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          background: headerBg,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 20,
            background: badgeBg,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.7)", display: "inline-block", flexShrink: 0 }}
            aria-hidden="true"
          />
          {isPending ? "Pending" : "In House"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isPending && overdueTasks.length > 0 && (
            <span
              style={{
                background: C.red,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: 10,
                letterSpacing: "0.05em",
              }}
            >
              {overdueTasks.length} OVERDUE
            </span>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted }}>{fmtArrival(admission.arrival)}</span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
          {titleCaseText(admission.last)}, {titleCaseText(admission.first)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, fontFamily: "monospace" }}>{fmtAge(admission.dob)}</div>
        <div className="ct-card-info">
          {[["Room", admission.room ? titleCaseText(admission.room) : "—"]].map(([l, v]) => (
            <div key={l} className="ct-card-info__cell">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>
                {l}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-word" }}>{v}</div>
            </div>
          ))}
          {admission.location && (
            <div className="ct-card-info__cell">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>Facility</div>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-word" }}>{titleCaseText(admission.location)}</div>
            </div>
          )}
          {admission.physician && (
            <div className="ct-card-info__cell ct-card-info__cell--full">
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>
                Physician
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-word" }}>{formatPhysicianDisplay(admission.physician)}</div>
            </div>
          )}
          <div className="ct-card-info__cell ct-card-info__cell--full">
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 2 }}>Diagnosis</div>
            <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-word" }}>{admission.dx ? titleCaseText(admission.dx) : "—"}</div>
          </div>
        </div>
        {admission.notes && (
          <div style={{ background: C.bg, borderRadius: 7, padding: "8px 11px", fontSize: 12, color: C.muted, lineHeight: 1.5, border: `1px solid ${C.border}`, fontStyle: "italic" }}>
            {admission.notes}
          </div>
        )}
        {!isPending && activeTasks && <TaskPills activeTasks={activeTasks} />}
      </div>

      <div className="ct-card-footer">
        {isPending && canEdit && (
          <button
            type="button"
            disabled={patientBusy}
            onClick={() => onPromote(admission.id)}
            style={{
              flex: 1,
              padding: "8px 6px",
              borderRadius: 8,
              border: `1.5px solid ${C.greenBorder}`,
              background: C.greenLight,
              color: "#14542e",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: patientBusy ? "default" : "pointer",
              opacity: patientBusy ? 0.65 : 1,
              minWidth: 110,
            }}
          >
            Mark In House
          </button>
        )}
        {!isPending && (
          <button
            type="button"
            disabled={patientBusy}
            onClick={() => onOpenTasks(admission.id)}
            style={{
              flex: 2,
              padding: "8px 6px",
              borderRadius: 8,
              border: `2px solid ${hasUrgent ? C.red : openTasks.length > 0 ? C.yellowBorder : C.greenBorder}`,
              background: hasUrgent ? "#fff0ee" : openTasks.length > 0 ? C.yellowLight : C.greenLight,
              color: hasUrgent ? C.red : openTasks.length > 0 ? "#7a4f08" : "#14542e",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: patientBusy ? "default" : "pointer",
              opacity: patientBusy ? 0.65 : 1,
            }}
          >
            Manage Tasks
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={patientBusy}
            onClick={() => onEdit(admission)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: C.surface,
              color: C.muted,
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              cursor: patientBusy ? "default" : "pointer",
              opacity: patientBusy ? 0.65 : 1,
            }}
          >
            Edit
          </button>
        )}
        {!isPending && canEdit && (
          <button
            type="button"
            disabled={patientBusy}
            onClick={() => onDischarge(admission.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1.5px solid ${C.red}`,
              background: C.redLight,
              color: C.red,
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: patientBusy ? "default" : "pointer",
              opacity: patientBusy ? 0.65 : 1,
            }}
          >
            Discharge
          </button>
        )}
        {isPending && canEdit && (
          <button
            type="button"
            disabled={patientBusy}
            onClick={() => onDelete(admission.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: C.surface,
              color: C.muted,
              fontFamily: "inherit",
              fontSize: 12,
              cursor: patientBusy ? "default" : "pointer",
              opacity: patientBusy ? 0.65 : 1,
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
