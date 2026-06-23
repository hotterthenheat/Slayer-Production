import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, destructive styling + alertdialog semantics for irreversible actions. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible, token-styled confirmation modal — a branded replacement for the
 * native window.confirm(). Escape and backdrop click cancel; the confirm button
 * is focused on open. Reusable anywhere a destructive action needs a guard.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg shrink-0 border ${danger ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}>
                  <AlertTriangle className={`w-5 h-5 ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="confirm-dialog-title" className="text-[var(--text-primary)] font-sans font-bold text-base leading-tight">{title}</h2>
                  <p id="confirm-dialog-message" className="text-[var(--text-secondary)] text-[13px] leading-relaxed mt-1.5">{message}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
              <button
                onClick={onCancel}
                className="px-3.5 py-2 text-[12px] font-semibold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                className={`px-3.5 py-2 text-[12px] font-bold rounded-lg transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ${danger ? 'bg-[var(--danger)] text-white hover:opacity-90' : 'bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90'}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ConfirmDialog;
