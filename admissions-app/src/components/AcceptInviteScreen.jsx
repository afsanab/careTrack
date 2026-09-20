import { useEffect, useId, useState } from "react";
import { auth } from "../api.js";
import Label from "./Label.jsx";
import { C } from "../theme/colors.js";

export default function AcceptInviteScreen({ inviteToken, onRegistered }) {
  const idBase = useId();
  const nameId = `${idBase}-fullname`;
  const passwordId = `${idBase}-password`;

  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!inviteToken?.trim()) {
        setLoading(false);
        setError("Invalid invitation link.");
        return;
      }
      try {
        const data = await auth.inviteInfo(inviteToken.trim());
        if (cancelled) return;
        setInfo({ username: data.username, role: data.role });
      } catch (e) {
        if (!cancelled) setError(e.message || "Invitation could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  async function submit() {
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { user: u } = await auth.register({
        token: inviteToken,
        password,
        fullName: fullName.trim() || undefined,
      });
      await onRegistered({
        username: u.username,
        role: u.role,
        fullName: u.fullName,
        mustChangePassword: u.mustChangePassword === true,
      });
    } catch (e) {
      setError(e.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  const iStyle = {
    width: "100%",
    padding: "11px 14px",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 14,
    background: C.bg,
    outline: "none",
    boxSizing: "border-box",
  };

  if (loading && !info && !error) {
    return (
      <div className="ct-auth-bg">
        <div style={{ color: "#fff", fontSize: 14 }}>Checking invitation…</div>
      </div>
    );
  }

  if (!info && error) {
    return (
      <div className="ct-auth-bg">
        <div className="ct-auth-card" style={{ maxWidth: 400, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ color: C.red, fontWeight: 700, marginBottom: 8 }} role="alert">
            Invitation unavailable
          </div>
          <div style={{ color: C.muted, fontSize: 14 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ct-auth-bg">
      <div className="ct-auth-card">
        <div style={{ fontFamily: "Georgia,serif", fontSize: 24, color: C.blue, marginBottom: 4 }} id={`${idBase}-heading`}>
          Create your account
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
          Username <strong style={{ color: C.text }}>{info?.username}</strong>
          {" · "}
          {info?.role === "admin" ? "Admissions staff" : "Physician"}
        </div>

        <Label htmlFor={nameId}>Full name (optional)</Label>
        <input id={nameId} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Dr. Jane Smith" style={{ ...iStyle, marginBottom: 14 }} />
        <Label htmlFor={passwordId}>Password (min. 12 characters)</Label>
        <input
          id={passwordId}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ ...iStyle, marginBottom: 6 }}
          autoComplete="new-password"
        />

        {error && (
          <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }} role="alert">
            {error}
          </div>
        )}

        <button type="button" disabled={loading} onClick={submit} style={{ width: "100%", padding: 13, background: loading ? C.muted : C.green, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", marginTop: 8 }}>
          {loading ? "Creating account…" : "Activate account"}
        </button>
      </div>
    </div>
  );
}
