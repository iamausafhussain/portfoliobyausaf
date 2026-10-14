/** Account: password, authenticators, sign out everywhere (spec 02 AD-5, AD-8). */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { NewPasswordForm } from '../auth/screens';
import authStyles from '../auth/auth.module.css';
import { FieldGroup } from '../fields/media';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { TotpSetup } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useConfirm, useToast } from '../ui/feedback';
import { FieldShell } from '../ui/FieldShell';
import { Button, Notice, ui } from '../ui/primitives';
import styles from './pages.module.css';

const MAX_AUTHENTICATORS = 2;

function Authenticators() {
  const repo = useRepository();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['admin', 'authenticators'],
    queryFn: () => repo.auth.listAuthenticators(),
  });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const items = list.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'authenticators'] });

  const start = async () => {
    setError(undefined);
    try {
      setSetup(await repo.auth.startTotpSetup('Backup'));
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Could not start setup.');
    }
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    try {
      await repo.auth.finishTotpSetup(setup.factorId, code);
      setSetup(null);
      setCode('');
      toast.success('Backup authenticator added.');
      await refresh();
    } catch (err) {
      setError(isRepoError(err) ? err.message : 'That code didn’t match.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Remove “${name}”?`,
      body: <p>You won&rsquo;t be able to sign in with codes from that app any more.</p>,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.auth.removeAuthenticator(id);
      toast.success('Authenticator removed.');
      await refresh();
    } catch (e) {
      toast.error(isRepoError(e) ? e.message : 'Could not remove it.');
    }
  };

  return (
    <FieldGroup
      title="Two-factor authenticators"
      description="Codes from any of these work. Add a backup (a second phone or a password manager) so losing your phone doesn't lock you out."
    >
      <ul className={styles.authList}>
        {items.map((a) => (
          <li key={a.id} className={styles.authItem}>
            <span>
              <strong>{a.name}</strong>
              <br />
              <span className={ui.help}>Added {new Date(a.createdAt).toLocaleDateString()}</span>
            </span>
            <Button
              size="small"
              variant="ghost"
              icon="trash"
              onClick={() => remove(a.id, a.name)}
              disabled={items.length <= 1}
              title={items.length <= 1 ? "You can't remove your only authenticator" : undefined}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {items.length <= 1 && <p className={ui.help}>Your only authenticator can&rsquo;t be removed.</p>}

      {setup ? (
        <form className={styles.stack} onSubmit={finish} noValidate>
          <div className={authStyles.qrWrap}>
            <img className={authStyles.qr} src={setup.qrCode} alt="QR code for your backup authenticator" />
            <code className={authStyles.secret}>{setup.secret}</code>
          </div>
          <FieldShell label="6-digit code from the backup app" required error={error}>
            {(a11y) => (
              <input
                {...a11y}
                className={`${ui.input} ${authStyles.codeInput}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            )}
          </FieldShell>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button type="submit" variant="primary" busy={busy}>
              Add backup
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        items.length < MAX_AUTHENTICATORS && (
          <Button icon="plus" onClick={start}>
            Add a backup authenticator
          </Button>
        )
      )}
    </FieldGroup>
  );
}

export function AccountPage() {
  const repo = useRepository();
  const { state, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: 'Sign out of all devices?',
      body: <p>Every browser signed in to the admin, including this one, will need to sign in again.</p>,
      confirmLabel: 'Sign out everywhere',
      danger: true,
    });
    if (!ok) return;
    await repo.auth.signOut('global');
    await refresh();
    navigate('/admin/login', { replace: true });
  };

  return (
    <>
      <PageHeader title="Account" description={state?.email ? `Signed in as ${state.email}` : undefined} />
      <PageBody>
        <Authenticators />
        <FieldGroup title="Change password">
          <div className={styles.stack}>
            <NewPasswordForm
              submitLabel="Change password"
              onDone={() => toast.success('Password changed.')}
            />
          </div>
        </FieldGroup>
        <FieldGroup title="Sessions">
          <Notice>Signed in on a shared computer, or lost a device? Sign out everywhere.</Notice>
          <div>
            <Button variant="danger" icon="logout" onClick={signOutEverywhere}>
              Sign out of all devices
            </Button>
          </div>
        </FieldGroup>
      </PageBody>
    </>
  );
}
