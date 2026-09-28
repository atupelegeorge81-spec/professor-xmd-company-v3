"use client";
// ConfirmDialog — popup ya kuthibitisha kitendo kisichorudishwa (mf. Clear ya chat). Kadi ya kawaida + fade/rise tu.
// Esc / kubonyeza nje = Cancel. Kitufe cha hatari kinapata focus ya kwanza ni Cancel (salama).
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

export function ConfirmDialog({
  open, title, message, confirmLabel = "Delete", cancelLabel = "Cancel", onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelFn.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center p-5" role="presentation">
      <button aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-[3px] animate-[fade_0.2s_both]" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="surface relative w-full max-w-[360px] rounded-2xl border border-[var(--color-line-strong)] bg-[rgb(14_16_22/0.98)] p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] animate-[rise_0.25s_both]"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(244_63_94/0.12)] text-[#f43f5e] ring-1 ring-[rgb(244_63_94/0.25)]">
          <Trash2 size={17} />
        </span>
        <h2 id="confirm-title" className="mt-3.5 text-[15.5px] font-semibold leading-6 text-[var(--color-fg)]">{title}</h2>
        {message && <p className="mt-1 text-[13px] leading-5 text-[var(--color-muted)]">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button ref={cancelRef} onClick={onCancel} className="btn-ghost h-10 flex-1 rounded-xl text-[13px] font-medium">{cancelLabel}</button>
          <button onClick={onConfirm} className="h-10 flex-1 rounded-xl bg-[#e11d48] text-[13px] font-semibold text-white transition hover:bg-[#f43f5e] active:scale-[0.98]">{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
