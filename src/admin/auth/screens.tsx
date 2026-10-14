/** Sign-in screens (spec 02 AD-2, AD-6, AD-7). */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { TotpSetup } from '../repository/types';
import { FieldShell } from '../ui/FieldShell';
import { Button, Notice, Spinner, ui } from '../ui/primitives';
import { routeForStatus, useAuth } from './AuthProvider';
import { FullScreenLoader, nextPath } from './RequireOwner';
import { TotpEnrolment } from './TotpEnrolment';
import styles from './auth.module.css';

export const MIN_PASSWORD_LENGTH = 12;

function AuthCard({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <p className="label">Ausaf Hussain · Admin</p>
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

const messageOf = (e: unknown) => (isRepoError(e) ? e.message : 'Something went wrong. Please try again.');

function CodeInput({
  value,
  onChange,
  error,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <FieldShell label="6-digit code" required error={error}>
      {(a11y) => (
        <input
          {...a11y}
          className={`${ui.input} ${styles.codeInput}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      )}
    </FieldShell>
  );
}

/** Sends a signed-in visitor straight on, without showing the screen. */
function useRedirectIfDone(allowed: string[]) {
  const { state } = useAuth();
  const location = useLocation();
  if (!state) return <FullScreenLoader />;
  if (!allowed.includes(state.status)) {
    const target = state.status === 'signed_in' ? nextPath(location.state) : routeForStatus(state.status);
    return <Navigate to={target} replace state={location.state} />;
  }
  return null;
}

/* ------------------------------------------------------------------ */

export function LoginPage() {
  const repo = useRepository();
  const { refresh, notice, setNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = useRedirectIfDone(['signed_out']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (redirect) return redirect;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const result = await repo.auth.signIn(email, password);
      if (result.status === 'not_owner') {
        setError("This account can't access the admin.");
        return;
      }
      const state = await refresh();
      navigate(state.status === 'signed_in' ? nextPath(location.state) : routeForStatus(state.status), {
        replace: true,
        state: location.state,
      });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Sign in" lead={repo.loginHint}>
      {notice && <Notice tone="warn">{notice}</Notice>}
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <FieldShell label="Email" required>
          {(a11y) => (
            <input
              {...a11y}
              className={ui.input}
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell label="Password" required>
          {(a11y) => (
            <input
              {...a11y}
              className={ui.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FieldShell>
        <Button type="submit" variant="primary" busy={busy}>
          Continue
        </Button>
      </form>
      <div className={styles.links}>
        <Link to="/admin/forgot-password">Forgot password?</Link>
        <Link to="/">Back to the site</Link>
      </div>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */

export function VerifyCodePage() {
  const repo = useRepository();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = useRedirectIfDone(['needs_code']);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (redirect) return redirect;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Enter the 6 digits from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await repo.auth.verifyCode(code);
      await refresh();
      navigate(nextPath(location.state), { replace: true });
    } catch (err) {
      setError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Enter your code" lead="Open your authenticator app and enter the current 6-digit code.">
      <form className={styles.form} onSubmit={submit} noValidate>
        <CodeInput value={code} onChange={setCode} error={error} />
        <Button type="submit" variant="primary" busy={busy}>
          Verify
        </Button>
      </form>
      <div className={styles.links}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={async () => {
            await repo.auth.signOut('local');
            await refresh();
          }}
        >
          Use a different account
        </button>
      </div>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */

export function SetupTwoFactorPage() {
  const repo = useRepository();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = useRedirectIfDone(['needs_setup']);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (redirect) return;
    let cancelled = false;
    repo.auth
      .startTotpSetup('Main phone')
      .then((s) => !cancelled && setSetup(s))
      .catch((e) => !cancelled && setLoadError(messageOf(e)));
    return () => {
      cancelled = true;
    };
    // run once when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (redirect) return redirect;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    if (code.length !== 6) {
      setError('Enter the 6 digits shown in your authenticator app.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await repo.auth.finishTotpSetup(setup.factorId, code);
      await refresh();
      navigate(nextPath(location.state), { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Set up two-factor login"
      lead="One-time setup. From now on you'll sign in with your password and a code from your phone."
    >
      <ol className={styles.steps}>
        <li>
          Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…).
        </li>
        <li>Scan this QR code with it — or, on your phone, tap &ldquo;Open in authenticator app&rdquo;.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {setup ? (
        <TotpEnrolment setup={setup} label="QR code for your authenticator app" />
      ) : (
        !loadError && (
          <div className={styles.qrWrap}>
            <Spinner label="Preparing QR code" />
          </div>
        )
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <CodeInput value={code} onChange={setCode} error={error} autoFocus={false} />
        <Button type="submit" variant="primary" busy={busy} disabled={!setup}>
          Finish setup
        </Button>
      </form>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */

export function ForgotPasswordPage() {
  const repo = useRepository();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await repo.auth.requestPasswordReset(email.trim(), `${window.location.origin}/admin/reset-password`);
    } catch {
      /* never reveal whether the address exists */
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <Notice>
          If that address belongs to the admin account, a reset link is on its way. It works once and expires
          after an hour.
        </Notice>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <FieldShell label="Email" required error={error}>
            {(a11y) => (
              <input
                {...a11y}
                className={ui.input}
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FieldShell>
          <Button type="submit" variant="primary" busy={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <div className={styles.links}>
        <Link to="/admin/login">Back to sign in</Link>
      </div>
    </AuthCard>
  );
}

/* ------------------------------------------------------------------ */

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

/** Shared by the reset page and the Account page. */
export function NewPasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const repo = useRepository();
  const { refresh } = useAuth();
  const [needsCode, setNeedsCode] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    repo.auth.passwordChangeNeedsCode().then(setNeedsCode, () => setNeedsCode(false));
  }, [repo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (needsCode) {
        await repo.auth.verifyCode(code);
        setNeedsCode(false);
      }
      await repo.auth.changePassword(password);
      await refresh();
      onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (needsCode === null) return <Spinner />;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      {needsCode && <CodeInput value={code} onChange={setCode} autoFocus />}
      <FieldShell label="New password" required help={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        {(a11y) => (
          <input
            {...a11y}
            className={ui.input}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FieldShell>
      <FieldShell label="Repeat new password" required>
        {(a11y) => (
          <input
            {...a11y}
            className={ui.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </FieldShell>
      <Button type="submit" variant="primary" busy={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function ResetPasswordPage() {
  const { state } = useAuth();
  const navigate = useNavigate();

  if (!state) return <FullScreenLoader />;
  if (state.status === 'signed_out') {
    return (
      <AuthCard title="Link expired">
        <Notice tone="warn">This reset link has expired or was already used. Request a new one.</Notice>
        <div className={styles.links}>
          <Link to="/admin/forgot-password">Send a new link</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <NewPasswordForm submitLabel="Save new password" onDone={() => navigate('/admin', { replace: true })} />
    </AuthCard>
  );
}
