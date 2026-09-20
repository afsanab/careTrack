import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  loadPatientsAndTasks,
  patientRowToAdmission,
  admissionToApiBody,
  apiTasksToSavedMap,
  syncTaskRowsForPatient,
  auth,
  patients as patientsApi,
  tasks as tasksApi,
} from "./api.js";
import { getActiveTasks, mergeTaskState } from "./taskLogic.js";
import { capitalize, formatPhysicianDisplay } from "./formatters.js";
import { C } from "./theme/colors.js";
import AcceptInviteScreen from "./components/AcceptInviteScreen.jsx";
import AdmissionCard from "./components/AdmissionCard.jsx";
import AdmissionModal from "./components/AdmissionModal.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import ChangePasswordModal from "./components/ChangePasswordModal.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import DischargeDialog from "./components/DischargeDialog.jsx";
import IdleTimeoutDialog from "./components/IdleTimeoutDialog.jsx";
import InviteStaffModal from "./components/InviteStaffModal.jsx";
import TaskPanel from "./components/TaskPanel.jsx";
import useIdleTimeout from "./hooks/useIdleTimeout.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [taskState, setTaskState] = useState({});
  const [filter, setFilter] = useState("all");
  const [physicianFilter, setPhysicianFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [tasksId, setTasksId] = useState(null);
  const [dischargeId, setDischargeId] = useState(null);
  const [deletePendingId, setDeletePendingId] = useState(null);
  const [booting, setBooting] = useState(true);
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get("invite"));
  const [inviteModal, setInviteModal] = useState(false);
  const [bannerError, setBannerError] = useState(null);
  const [busyPatientId, setBusyPatientId] = useState(null);
  const [discharging, setDischarging] = useState(false);
  const [deletingPending, setDeletingPending] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForced, setPwForced] = useState(false);

  const reportError = useCallback((msg) => {
    const m = typeof msg === "string" && msg.trim() ? msg.trim() : "Something went wrong.";
    setBannerError(m);
  }, []);

  const loadSession = async (u) => {
    const { admissions: adm, taskState: ts } = await loadPatientsAndTasks();
    setUser(u);
    setAdmissions(adm);
    setTaskState(ts);
    if (u?.mustChangePassword) {
      setPwForced(true);
      setShowPwModal(true);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (inviteToken) {
        setBooting(false);
        return;
      }
      try {
        const { user: u } = await auth.me();
        if (cancelled) return;
        await loadSession({
          username: u.username,
          role: u.role,
          fullName: u.fullName,
          mustChangePassword: u.mustChangePassword === true,
        });
      } catch {
        // Not signed in (no session cookie / expired); show auth screen.
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(u) {
    await loadSession(u);
  }

  async function handleInviteRegistered(u) {
    window.history.replaceState({}, "", window.location.pathname);
    setInviteToken(null);
    await loadSession(u);
  }

  const handleSignOut = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
    setAdmissions([]);
    setTaskState({});
    setBannerError(null);
    setShowPwModal(false);
    setPwForced(false);
  }, []);

  const idle = useIdleTimeout({
    enabled: Boolean(user),
    idleMs: 25 * 60 * 1000,
    graceMs: 5 * 60 * 1000,
    onTimeout: handleSignOut,
  });

  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'DM Sans',system-ui,sans-serif", padding: 24 }}>
        <div style={{ color: C.muted, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (inviteToken && !user) {
    return <AcceptInviteScreen inviteToken={inviteToken} onRegistered={handleInviteRegistered} />;
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  const canEdit = user.role === "admin";
  const physicianList = [...new Set(admissions.map(a => a.physician).filter(Boolean))].sort();
  const locationList = [...new Set(admissions.map(a => a.location).filter(Boolean))].sort();

  function getPatientTasks(admission) {
    if (!admission.admitTs || admission.status !== "inhouse") return null;
    const defs = getActiveTasks(admission.admitTs);
    const saved = taskState[admission.id] || {};
    return mergeTaskState(defs, saved);
  }

  const filtered = admissions.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (physicianFilter !== "all" && a.physician !== physicianFilter) return false;
    if (locationFilter !== "all" && a.location !== locationFilter) return false;
    if (taskFilter !== "all") {
      const t = getPatientTasks(a);
      if (!t) return false;
      if (taskFilter === "open") return t.some(x => x.assignedAt && x.status !== "completed");
      if (taskFilter === "overdue") return t.some(x => x.status !== "completed" && Math.ceil((x.dueDate - Date.now()) / 86400000) < 0);
    }
    return true;
  });
  const pendingCount = admissions.filter(a => a.status === "pending").length;
  const inhouseCount = admissions.filter(a => a.status === "inhouse").length;
  const displayName = user.fullName?.trim()
    ? user.fullName
    : user.role === "physician"
      ? `Dr. ${capitalize(user.username.split(".").pop())}`
      : capitalize(user.username.replace(".", " "));
  const initials = (user.fullName?.trim() || user.username)
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "U";

  const openTaskCount = admissions.reduce((acc, a) => {
    const t = getPatientTasks(a);
    if (!t) return acc;
    return acc + t.filter(x => x.assignedAt && x.status !== "completed").length;
  }, 0);

  const overdueCount = admissions.reduce((acc, a) => {
    const t = getPatientTasks(a);
    if (!t) return acc;
    return acc + t.filter(x => x.status !== "completed" && Math.ceil((x.dueDate - Date.now()) / 86400000) < 0).length;
  }, 0);

  async function ensureTaskApiId(patientId, taskId) {
    const admission = admissions.find((a) => a.id === patientId);
    const saved = taskState[patientId]?.[taskId];
    if (saved?.apiTaskId) return saved.apiTaskId;
    if (!admission?.admitTs) return null;
    await syncTaskRowsForPatient(patientId, admission.admitTs);
    const { tasks: trows } = await tasksApi.list(patientId);
    const m = apiTasksToSavedMap(trows);
    setTaskState((prev) => ({ ...prev, [patientId]: { ...prev[patientId], ...m } }));
    return m[taskId]?.apiTaskId;
  }

  async function promoteToInhouse(id) {
    setBusyPatientId(id);
    try {
      await patientsApi.admit(id);
      const { patient } = await patientsApi.get(id);
      const adm = patientRowToAdmission(patient);
      const admitTs = new Date(patient.admit_ts).getTime();
      setAdmissions((prev) => prev.map((a) => (a.id === id ? adm : a)));
      await syncTaskRowsForPatient(id, admitTs);
      const { tasks: trows } = await tasksApi.list(id);
      setTaskState((prev) => ({ ...prev, [id]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      reportError(e.message || "Could not admit patient.");
    } finally {
      setBusyPatientId(null);
    }
  }

  async function dischargePatient(id) {
    setDischarging(true);
    setBusyPatientId(id);
    try {
      await patientsApi.discharge(id);
      setAdmissions((prev) => prev.filter((a) => a.id !== id));
      setTaskState((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setDischargeId(null);
      if (tasksId === id) setTasksId(null);
    } catch (e) {
      reportError(e.message || "Could not discharge patient.");
    } finally {
      setDischarging(false);
      setBusyPatientId(null);
    }
  }

  async function saveAdmission(form) {
    try {
      const body = admissionToApiBody(form);
      if (modal?.type === "edit") {
        const prev = modal.admission;
        const { patient } = await patientsApi.update(prev.id, body);
        setAdmissions((p) => p.map((a) => (a.id === prev.id ? patientRowToAdmission(patient) : a)));
        if (patient.status === "inhouse" && patient.admit_ts) {
          const ts = new Date(patient.admit_ts).getTime();
          await syncTaskRowsForPatient(patient.id, ts);
          const { tasks: trows } = await tasksApi.list(patient.id);
          setTaskState((s) => ({ ...s, [patient.id]: apiTasksToSavedMap(trows) }));
        }
      } else {
        const { patient } = await patientsApi.create(body);
        setAdmissions((p) => [patientRowToAdmission(patient), ...p]);
        if (patient.status === "inhouse" && patient.admit_ts) {
          const ts = new Date(patient.admit_ts).getTime();
          await syncTaskRowsForPatient(patient.id, ts);
          const { tasks: trows } = await tasksApi.list(patient.id);
          setTaskState((s) => ({ ...s, [patient.id]: apiTasksToSavedMap(trows) }));
        }
      }
      setModal(null);
    } catch (e) {
      throw new Error(e.message || "Could not save admission.");
    }
  }

  async function assignTask(patientId, taskId, unassign = false) {
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) {
        reportError("Could not synchronize task.");
        return;
      }
      await tasksApi.assign(patientId, tid, unassign ? { unassign: true } : {});
      const { tasks: trows } = await tasksApi.list(patientId);
      setTaskState((prev) => ({ ...prev, [patientId]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      reportError(e.message || "Could not update assignment.");
    }
  }

  async function completeTask(patientId, taskId) {
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) {
        reportError("Could not synchronize task.");
        return;
      }
      await tasksApi.complete(patientId, tid);
      const { tasks: trows } = await tasksApi.list(patientId);
      setTaskState((prev) => ({ ...prev, [patientId]: apiTasksToSavedMap(trows) }));
    } catch (e) {
      reportError(e.message || "Could not complete task.");
    }
  }

  function revertPatientTaskNote(patientId, taskId, noteValue) {
    setTaskState((prevState) => ({
      ...prevState,
      [patientId]: {
        ...(prevState[patientId] || {}),
        [taskId]: { ...(prevState[patientId]?.[taskId] || {}), note: noteValue },
      },
    }));
  }

  async function updateNote(patientId, taskId, note) {
    const previousNote = taskState[patientId]?.[taskId]?.note ?? "";
    setTaskState((prev) => ({
      ...prev,
      [patientId]: {
        ...(prev[patientId] || {}),
        [taskId]: { ...(prev[patientId]?.[taskId] || {}), note },
      },
    }));
    try {
      const tid = await ensureTaskApiId(patientId, taskId);
      if (!tid) {
        revertPatientTaskNote(patientId, taskId, previousNote);
        reportError("Could not synchronize task.");
        return;
      }
      await tasksApi.updateNote(patientId, tid, note);
    } catch (e) {
      revertPatientTaskNote(patientId, taskId, previousNote);
      reportError(e.message || "Could not save note.");
    }
  }

  async function confirmDeletePending(id) {
    setDeletingPending(true);
    setBusyPatientId(id);
    try {
      await patientsApi.delete(id);
      setAdmissions((p) => p.filter((x) => x.id !== id));
      setDeletePendingId(null);
    } catch (e) {
      reportError(e.message || "Could not remove admission.");
    } finally {
      setDeletingPending(false);
      setBusyPatientId(null);
    }
  }

  const tasksAdmission = admissions.find(a => a.id === tasksId);
  const dischargeAdmission = admissions.find(a => a.id === dischargeId);
  const deletePendingAdmission = admissions.find(a => a.id === deletePendingId);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans',system-ui,sans-serif", fontSize: 14 }}>
      <div className="ct-topbar">
        <div className="ct-topbar__brand">Care<em style={{ color: "#7aabf0" }}>Track</em></div>
        <div className="ct-topbar__actions">
          {canEdit && (
            <button type="button" onClick={() => setInviteModal(true)} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", padding: "6px 14px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Invite staff
            </button>
          )}
          <button
            type="button"
            onClick={() => { setPwForced(false); setShowPwModal(true); }}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)", padding: "5px 12px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
          >
            Change password
          </button>
          <div className="ct-topbar__user">
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }} aria-hidden="true">{initials}</div>
            <span className="ct-topbar__user-name">{displayName}</span>
            <span className="ct-topbar__role">({user.role === "physician" ? "Physician" : "Admissions"})</span>
          </div>
          <button type="button" onClick={handleSignOut} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", padding: "5px 12px", borderRadius: 6, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      {bannerError && (
        <div className="ct-error-banner" role="alert">
          <span>{bannerError}</span>
          <button type="button" onClick={() => setBannerError(null)}>Dismiss</button>
        </div>
      )}

      <div className="ct-page">
        <div className="ct-stats">
          {[
            ["P", pendingCount, C.yellow, "Pending", "#fff3e0", "#7a4f08", () => { setFilter(filter === "pending" ? "all" : "pending"); setTaskFilter("all"); }],
            ["H", inhouseCount, C.green, "In House", C.greenLight, "#14542e", () => { setFilter(filter === "inhouse" ? "all" : "inhouse"); setTaskFilter("all"); }],
            ["T", openTaskCount, C.blue, "Open Tasks", C.blueLight, C.blue, () => { setTaskFilter(taskFilter === "open" ? "all" : "open"); setFilter("all"); }],
            ["!", overdueCount, C.red, "Overdue Tasks", C.redLight, C.red, () => { setTaskFilter(taskFilter === "overdue" ? "all" : "overdue"); setFilter("all"); }],
          ].map(([icon, num, color, label, bg, iconColor, onClick]) => {
            const isActive =
              (label === "Pending" && filter === "pending") ||
              (label === "In House" && filter === "inhouse") ||
              (label === "Open Tasks" && taskFilter === "open") ||
              (label === "Overdue Tasks" && taskFilter === "overdue");
            return (
              <button key={label} type="button" onClick={onClick} className="ct-stats__card" style={{ background: C.surface, border: `2px solid ${isActive ? color : C.border}`, boxShadow: isActive ? `0 0 0 3px ${color}30` : num > 0 && label === "Overdue Tasks" ? `0 0 0 2px rgba(192,57,43,0.2)` : "none", cursor: "pointer" }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: isActive ? color : bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: isActive ? "#fff" : iconColor, flexShrink: 0 }}><span aria-hidden="true">{icon}</span></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{num}</div>
                  <div style={{ fontSize: 11, color: isActive ? color : C.muted, fontWeight: isActive ? 700 : 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="ct-toolbar">
          <div className="ct-toolbar__filters">
            {[
              ["all", "All", filter === "all" ? C.blue : C.border, filter === "all" ? C.blueLight : C.surface, filter === "all" ? C.blue : C.muted],
              ["pending", "Pending", filter === "pending" ? C.yellow : C.border, filter === "pending" ? C.yellowLight : C.surface, filter === "pending" ? "#7a4f08" : C.muted],
              ["inhouse", "In House", filter === "inhouse" ? C.green : C.border, filter === "inhouse" ? C.greenLight : C.surface, filter === "inhouse" ? "#14542e" : C.muted],
            ].map(([f, label, borderCol, bgCol, textCol]) => (
              <button key={f} type="button" onClick={() => setFilter(f)} style={{ padding: "8px 18px", borderRadius: 20, border: `1.5px solid ${borderCol}`, background: bgCol, color: textCol, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>{label}</button>
            ))}
            {canEdit && physicianList.length > 0 && (
              <select value={physicianFilter} aria-label="Filter by physician" onChange={e => setPhysicianFilter(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${physicianFilter !== "all" ? C.blue : C.border}`, background: physicianFilter !== "all" ? C.blueLight : C.surface, color: physicianFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="all">All Physicians</option>
                {physicianList.map(p => <option key={p} value={p}>{formatPhysicianDisplay(p)}</option>)}
              </select>
            )}
            {canEdit && locationList.length > 0 && (
              <select value={locationFilter} aria-label="Filter by location" onChange={e => setLocationFilter(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${locationFilter !== "all" ? C.blue : C.border}`, background: locationFilter !== "all" ? C.blueLight : C.surface, color: locationFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
                <option value="all">All Locations</option>
                {locationList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
          {!canEdit && locationList.length > 0 && (
            <select value={locationFilter} aria-label="Filter by facility" onChange={e => setLocationFilter(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${locationFilter !== "all" ? C.blue : C.border}`, background: locationFilter !== "all" ? C.blueLight : C.surface, color: locationFilter !== "all" ? C.blue : C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", outline: "none", minHeight: 40, appearance: "none", paddingRight: 32, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a7570' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", alignSelf: "flex-start" }}>
              <option value="all">All Facilities</option>
              {locationList.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setModal({ type: "add" })} style={{ width: "100%", padding: "12px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>+ New Admission</button>
        </div>

        <div className="ct-cards">
          {filtered.length === 0
            ? <div className="ct-cards__empty">
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3, color: C.muted }}>+</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: C.text }}>No admissions found</div>
              <div style={{ fontSize: 13 }}>Add a new admission using the button above.</div>
            </div>
            : filtered.map(a => (
              <AdmissionCard key={a.id} admission={a} activeTasks={getPatientTasks(a)} canEdit={canEdit} patientBusy={busyPatientId === a.id}
                onEdit={a => setModal({ type: "edit", admission: a })}
                onDelete={(id) => setDeletePendingId(id)}
                onPromote={promoteToInhouse}
                onDischarge={id => setDischargeId(id)}
                onOpenTasks={id => setTasksId(id)}
              />
            ))
          }
        </div>
      </div>

      {tasksId && tasksAdmission && (() => {
        const at = getPatientTasks(tasksAdmission);
        return at && (
          <TaskPanel admission={tasksAdmission} activeTasks={at} role={user.role}
            onClose={() => setTasksId(null)} onAssign={assignTask} onComplete={completeTask} onUpdateNote={updateNote} />
        );
      })()}

      {modal && <AdmissionModal admission={modal.type === "edit" ? modal.admission : null} onSave={saveAdmission} onClose={() => setModal(null)} />}

      {dischargeId && dischargeAdmission && (
        <DischargeDialog
          admission={dischargeAdmission}
          confirming={discharging}
          onCancel={() => { if (!discharging) setDischargeId(null); }}
          onConfirm={() => dischargePatient(dischargeId)}
        />
      )}

      {deletePendingId && deletePendingAdmission && (
        <ConfirmDialog
          title="Remove this admission?"
          message={`${deletePendingAdmission.last}, ${deletePendingAdmission.first} will be removed from the pending list.`}
          confirmLabel="Remove"
          destructive
          busy={deletingPending}
          onCancel={() => { if (!deletingPending) setDeletePendingId(null); }}
          onConfirm={() => confirmDeletePending(deletePendingId)}
        />
      )}

      {inviteModal && (
        <InviteStaffModal onClose={() => setInviteModal(false)} />
      )}

      {showPwModal && (
        <ChangePasswordModal
          forced={pwForced}
          onClose={() => { if (!pwForced) setShowPwModal(false); }}
          onDone={() => {
            setShowPwModal(false);
            setPwForced(false);
            setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
          }}
        />
      )}

      {idle.warning && (
        <IdleTimeoutDialog
          remainingMs={idle.remainingMs}
          onStayActive={idle.stayActive}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}
