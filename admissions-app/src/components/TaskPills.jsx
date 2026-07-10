import { fmtDate } from "../formatters.js";
import { C } from "../theme/colors.js";

export default function TaskPills({ activeTasks }) {
  if (!activeTasks || activeTasks.length === 0) return null;

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.light, marginBottom: 8 }}>Clinical Tasks</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {activeTasks.map((t) => {
          const due = Math.ceil((t.dueDate - Date.now()) / 86400000);
          const isOver = due < 0;
          const isSoon = due >= 0 && due <= 3;
          const isDone = t.status === "completed";

          let bg, border, textColor, iconEl, dueLabel;

          if (isDone) {
            bg = C.greenLight;
            border = C.greenBorder;
            textColor = C.green;
            iconEl = "OK";
            dueLabel = "Complete";
          } else if (isOver) {
            bg = "#fff0ee";
            border = C.red;
            textColor = C.red;
            iconEl = "!";
            dueLabel = `${Math.abs(due)}d overdue`;
          } else if (isSoon) {
            bg = "#fffbf0";
            border = C.yellow;
            textColor = "#7a4f08";
            iconEl = "!";
            dueLabel = due === 0 ? "Due today" : `${due}d left`;
          } else if (t.assignedAt) {
            bg = C.yellowLight;
            border = C.yellowBorder;
            textColor = "#7a4f08";
            iconEl = "--";
            dueLabel = `Due ${fmtDate(t.dueDate)}`;
          } else {
            bg = "#f4f1ec";
            border = C.border;
            textColor = C.muted;
            iconEl = "o";
            dueLabel = `Due ${fmtDate(t.dueDate)}`;
          }

          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderRadius: 8, background: bg, border: `1.5px solid ${border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">{iconEl}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: textColor }}>{t.label}</span>
                {!isDone && !t.assignedAt && (
                  <span style={{ fontSize: 10, background: C.border, color: C.muted, borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Unassigned</span>
                )}
                {!isDone && t.assignedAt && (
                  <span style={{ fontSize: 10, background: isOver ? C.red : isSoon ? C.yellow : C.yellowBorder, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>Assigned</span>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: textColor, whiteSpace: "nowrap" }}>{dueLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
