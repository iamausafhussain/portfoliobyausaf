/** Toasts and confirmation dialogs (spec 02 §3.2, §3.9). */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';
import { Button } from './primitives';
import styles from './feedback.module.css';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show(kind: ToastKind, message: string, action?: Toast['action']): void;
  success(message: string): void;
  error(message: string, action?: Toast['action']): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const api = useMemo<ToastApi>(() => {
    const show: ToastApi['show'] = (kind, message, action) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message, action }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    };
    return {
      show,
      success: (m) => show('success', m),
      error: (m, a) => show('error', m, a),
    };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'sparkle'} />
            <span className={styles.toastText}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className={styles.toastClose}
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const close = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog options={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
    return () => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
    >
      <h2 id="confirm-title" className={styles.dialogTitle}>
        {options.title}
      </h2>
      {options.body && <div className={styles.dialogBody}>{options.body}</div>}
      <div className={styles.dialogActions}>
        <Button onClick={() => onClose(false)} autoFocus={options.danger}>
          {options.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          variant={options.danger ? 'danger' : 'primary'}
          onClick={() => onClose(true)}
          autoFocus={!options.danger}
        >
          {options.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </dialog>
  );
}
