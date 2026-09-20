import { useRef } from "react";
import { useModalA11y } from "../hooks/useModalA11y.js";

/**
 * Accessible modal: role="dialog", aria-modal, focus trap, Escape closes.
 * `labelledById` must match an element id inside children (typically the heading).
 */
export default function ModalShell({
  labelledById,
  onBackdropClick,
  children,
  className = "",
  overlayClassName = "",
  style,
  overlayStyle,
}) {
  const panelRef = useRef(null);
  useModalA11y(true, panelRef, onBackdropClick);

  return (
    <div
      className={overlayClassName || "ct-modal-overlay"}
      style={overlayStyle}
      onClick={onBackdropClick}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={className || "ct-modal"}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
