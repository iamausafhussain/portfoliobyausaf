/**
 * Shows how to add the admin to an authenticator app:
 *  - a QR code we draw ourselves from the otpauth:// link — always dark on white with a
 *    proper quiet zone, so phone cameras can read it in either theme,
 *  - an "Add to authenticator app" button for when the setup happens on the phone itself
 *    (you can't scan your own screen),
 *  - the setup key, grouped and copyable, for typing in by hand.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { themes } from '../../theme/tokens';
import type { TotpSetup } from '../repository/types';
import { Button, Spinner } from '../ui/primitives';
import styles from './auth.module.css';

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" */
export function groupKey(secret: string): string {
  return secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export async function qrSvgDataUri(uri: string): Promise<string> {
  const svg = await QRCode.toString(uri, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4, // quiet zone required by the QR standard
    color: { dark: themes.light.color.fg, light: themes.light.color.bgElevated },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function TotpEnrolment({ setup, label }: { setup: TotpSetup; label: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    qrSvgDataUri(setup.uri).then(
      (d) => active && setQr(d),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [setup.uri]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret.replace(/\s+/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowKey(true);
    }
  };

  return (
    <div className={styles.qrWrap}>
      {/* light theme inside the frame: the code is always dark on white */}
      <div className={styles.qrFrame} data-theme="light">
        {qr ? (
          <img className={styles.qr} src={qr} alt={label} width={176} height={176} />
        ) : failed ? (
          <span className={styles.secret}>Couldn&rsquo;t draw the QR code — use the setup key below.</span>
        ) : (
          <Spinner label="Preparing QR code" />
        )}
      </div>

      <a className={styles.appLink} href={setup.uri}>
        Open in authenticator app
      </a>

      <div className={styles.keyRow}>
        <button type="button" className={styles.linkButton} onClick={() => setShowKey((s) => !s)}>
          {showKey ? 'Hide setup key' : "Can't scan? Show the setup key"}
        </button>
        {showKey && (
          <>
            <code className={styles.secret} aria-label="Setup key">
              {groupKey(setup.secret)}
            </code>
            <Button size="small" icon={copied ? 'check' : 'copy'} onClick={copy}>
              {copied ? 'Copied' : 'Copy key'}
            </Button>
            <p className={styles.keyHelp}>
              In your app choose &ldquo;Enter a setup key&rdquo;, paste it, and pick &ldquo;Time based&rdquo;.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
