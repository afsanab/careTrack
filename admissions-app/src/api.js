/**
 * CareTrack API client.
 *
 * Auth: the backend issues an httpOnly session cookie on login/register, plus
 * a non-httpOnly CSRF cookie that we echo back as the `X-CSRF-Token` header
 * on every state-changing request (double-submit cookie pattern).
 *
 * No JWT is stored in JS land. Session lifetime is controlled by the
 * server-set cookie expiration; `auth.me()` is used to detect whether the
 * cookie is still valid on app boot.
 */
import { getActiveTasks } from "./taskLogic.js";

const BASE = import.meta.env.VITE_API_BASE || "";

function readCsrfCookie() {
  const m = document.cookie.match(/(?:^|;\s*)caretrack_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const isUnsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (isUnsafe) {
    const csrf = readCsrfCookie();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.issues = data?.issues;
    err.retryAfterSec = data?.retryAfterSec;
    throw err;
  }
  return data || {};
}

const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body);
const patch = (path, body) => request("PATCH", path, body);
const del = (path) => request("DELETE", path);

export const auth = {
  login: (username, password) => post("/api/auth/login", { username, password }),
  logout: () => post("/api/auth/logout"),
  me: () => get("/api/auth/me"),
  inviteInfo: (token) => get(`/api/auth/invite-info?token=${encodeURIComponent(token)}`),
  register: (body) => post("/api/auth/register", body),
  changePassword: (currentPassword, newPassword) =>
    post("/api/auth/change-password", { currentPassword, newPassword }),
};

export const invitations = {
  create: (body) => post("/api/invitations", body),
};

export const patients = {
  list: (filters = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return get(`/api/patients${qs ? `?${qs}` : ""}`);
  },
  get: (id) => get(`/api/patients/${id}`),
  create: (data) => post("/api/patients", data),
  update: (id, data) => patch(`/api/patients/${id}`, data),
  admit: (id) => post(`/api/patients/${id}/admit`),
  discharge: (id) => post(`/api/patients/${id}/discharge`),
  delete: (id) => del(`/api/patients/${id}`),
};

export const tasks = {
  list: (patientId) => get(`/api/patients/${patientId}/tasks`),
  upsert: (patientId, data) => post(`/api/patients/${patientId}/tasks`, data),
  assign: (patientId, taskId, body = {}) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/assign`, body),
  complete: (patientId, taskId) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/complete`),
  updateNote: (patientId, taskId, note) =>
    patch(`/api/patients/${patientId}/tasks/${taskId}/note`, { note }),
};

// ── Mappers ─────────────────────────────────────────────

function formatDob(dob) {
  if (!dob) return "";
  const s = typeof dob === "string" ? dob : new Date(dob).toISOString();
  return s.slice(0, 10);
}

export function patientRowToAdmission(p) {
  let arrival = "";
  if (p.arrival_at) {
    const d = new Date(p.arrival_at);
    const pad = (n) => String(n).padStart(2, "0");
    arrival = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return {
    id: p.id,
    last: p.last_name,
    first: p.first_name,
    dob: formatDob(p.dob),
    room: p.room || "",
    arrival,
    dx: p.diagnosis || "",
    notes: p.notes || "",
    status: p.status,
    admitTs: p.admit_ts ? new Date(p.admit_ts).getTime() : null,
    physician: p.physician_username || "",
    location: p.location || "",
  };
}

export function admissionToApiBody(form) {
  return {
    firstName: form.first.trim(),
    lastName: form.last.trim(),
    dob: form.dob,
    room: form.room || null,
    arrivalAt: form.arrival ? new Date(form.arrival).toISOString() : null,
    diagnosis: form.dx || null,
    notes: form.notes || null,
    status: form.status,
    physicianUsername: form.physician?.trim() || null,
    location: form.location || null,
  };
}

export function apiTasksToSavedMap(rows) {
  const saved = {};
  for (const t of rows) {
    const id =
      t.task_key === "hp" ? "hp" : t.task_key === "30day" ? "30day" : `60day-c${t.cycle}`;
    saved[id] = {
      status: t.status === "completed" ? "completed" : "pending",
      assignedAt: t.assigned_at ? new Date(t.assigned_at).getTime() : null,
      completedAt: t.completed_at ? new Date(t.completed_at).getTime() : null,
      completedBy: t.completed_by || null,
      note: t.note || "",
      apiTaskId: t.id,
    };
  }
  return saved;
}

export async function syncTaskRowsForPatient(patientId, admitTs) {
  const defs = getActiveTasks(admitTs);
  for (const def of defs) {
    await tasks.upsert(patientId, {
      taskKey: def.key,
      taskLabel: def.label,
      cycle: def.cycle,
      dueAt: new Date(def.dueDate).toISOString(),
      appearsAt: def.appearsOn ? new Date(def.appearsOn).toISOString() : null,
    });
  }
}

export async function loadPatientsAndTasks() {
  const { patients: rows } = await patients.list({ pageSize: 100 });
  const adm = rows.map(patientRowToAdmission);
  const inhouse = rows.filter((p) => p.status === "inhouse" && p.admit_ts);
  const taskState = {};
  await Promise.all(
    inhouse.map(async (p) => {
      const { tasks: trows } = await tasks.list(p.id);
      taskState[p.id] = apiTasksToSavedMap(trows);
    })
  );
  return { admissions: adm, taskState };
}
