import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { auth } from '../supabase';

const EMAIL_KEY = 'montaud.email';

function hashError(): string | null {
  const h = new URLSearchParams(location.hash.slice(1));
  const d = h.get('error_description');
  if (!d) return null;
  return /expired|invalid/i.test(d) ? 'Ce lien a expiré ou a déjà servi. Demande un nouveau lien.' : d.replace(/\+/g, ' ');
}

export function Login() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(hashError);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(EMAIL_KEY, email.trim());
    } catch {
      /* ignoré */
    }
    try {
      await auth.sendLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(email.trim(), code.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card card">
        <span className="logo-mark xl">M</span>
        <h1>Montaud</h1>
        <p className="muted">Le carnet de la maison</p>
        {!sent ? (
          <form onSubmit={send} className="form">
            <div className="field">
              <label htmlFor="login-email">Ton adresse e-mail</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@exemple.fr"
              />
            </div>
            <button className="btn primary block" disabled={busy}>
              <Mail size={16} /> {busy ? 'Envoi…' : 'Recevoir un lien de connexion'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="form">
            <p className="login-sent">
              📬 Un e-mail vient d’être envoyé à <strong>{email}</strong>. Clique sur le lien qu’il contient
              <span className="muted"> (ou saisis le code s’il y en a un)</span>.
            </p>
            <div className="field">
              <label htmlFor="login-code">Code reçu par e-mail</label>
              <input
                id="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button className="btn primary block" disabled={busy || code.trim().length < 6}>
              Valider le code
            </button>
            <button type="button" className="btn ghost block" onClick={() => setSent(false)}>
              Changer d’adresse / renvoyer
            </button>
          </form>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
