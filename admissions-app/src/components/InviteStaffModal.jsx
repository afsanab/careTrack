import { useEffect, useId, useRef, useState } from "react";
import { invitations } from "../api.js";
import Label from "./Label.jsx";
import ModalShell from "./ModalShell.jsx";
import { C } from "../theme/colors.js";

export default function InviteStaffModal({ onClose, onCreated }) {
  const titleId = useId();
  const usernameFieldId = useId();
  const roleSelectId = useId();
  const emailFieldId = useId();
  const inviteLinkFieldId = useId();

  const [username, setUsername] = useState("");
  const [role, setRole] = useState("physician");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const copyResetRef = useRef(null);

  useEffect(() => () => copyResetRef.current && clearTimeout(copyResetRef.current), []);

  async function copyInviteLink(url) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("aria-hidden", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyState("copied");
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  async function submit() {
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await invitations.create({
        username: username.trim(),
        role,
        email: email.trim() || undefined,
      });
      setResult(data);
      onCreated?.();
    } catch (e) {
      setError(e.message || "Could not create invitation.");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <ModalShell labelledById={titleId} overlayClassName="ct-modal-overlay" overlayStyle={{ zIndex: 400 }} onBackdropClick={onClose} className="ct-modal" style={{ maxWidth: 440 }}>
      <div style={{ padding: "16px 20px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div id={titleId} style={{ fontFamily: "Georgia,serif", fontSize: 20 }}>
          Invite staff
        </div>
        <button type="button" aria-label="Close invitation dialog" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 16, color: C.muted }}>
          <span aria-hidden="true">X</span>
        </button>
      </div>
      <div className="ct-modal__body" style={{ padding: "16px 20px 20px" }}>
        {result ? (
          <>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{result.message}</p>
            {result.emailSent && (
              <p style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 10 }}>
                A message with the invite link was sent to the email address you entered.
              </p>
            )}
            {result.emailNote && <p style={{ fontSize: 12, color: C.yellow, marginBottom: 10 }}>{result.emailNote}</p>}
            <Label htmlFor={inviteLinkFieldId}>Invite link (copy if needed)</Label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 12 }}>
              <input
                id={inviteLinkFieldId}
                readOnly
                value={result.inviteUrl}
                style={{ ...iStyle, flex: 1, minWidth: 0, fontSize: 12, marginBottom: 0 }}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copyInviteLink(result.inviteUrl)}
                style={{
                  flexShrink: 0,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: copyState === "copied" ? C.greenLight : C.surface,
                  color: copyState === "copied" ? C.green : C.text,
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy link"}
              </button>
            </div>
            <p
              aria-live="polite"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              {copyState === "copied" ? "Invite link copied to clipboard." : copyState === "error" ? "Could not copy automatically. Select the link field and copy manually." : ""}
            </p>
            <p style={{ fontSize: 11, color: C.light }}>
              Share this link only over secure channels. It expires on {new Date(result.invitation.expires_at).toLocaleString()}.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
              The invited person will choose their password when they open the link. If the server is configured with Resend, filling in email below sends the link automatically.
            </p>
            <div style={{ marginBottom: 12 }}>
              <Label htmlFor={usernameFieldId}>Username (login ID)</Label>
              <input id={usernameFieldId} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. dr.lee" style={iStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label htmlFor={roleSelectId}>Role</Label>
              <select id={roleSelectId} value={role} onChange={(e) => setRole(e.target.value)} style={iStyle}>
                <option value="physician">Physician</option>
                <option value="admin">Admissions staff</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label htmlFor={emailFieldId}>Email (optional)</Label>
              <input id={emailFieldId} value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="colleague@clinic.com — invite link sent here when email is enabled" style={iStyle} />
            </div>
            {error && (
              <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }} role="alert">
                {error}
              </div>
            )}
            <button type="button" disabled={loading} onClick={submit} style={{ width: "100%", padding: 12, background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
              {loading ? "Creating…" : "Create invitation"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
