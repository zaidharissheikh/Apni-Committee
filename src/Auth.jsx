import React, { useEffect, useState } from 'react';
import { Flower2, ArrowRight, LockKeyhole, Mail, Eye, EyeOff, Users, Ticket, RefreshCw } from 'lucide-react';
import { api } from './api.js';

export function Brand() {
  return <a href="/" className="brand"><Flower2 size={32}/><span>apni<span className="brand-bottom">committee</span></span></a>;
}
export default function AuthGate({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  async function check() {
    setLoading(true); setError('');
    try { setUser((await api('auth/me')).user); }
    catch { setError('Could not connect. Check your connection and try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    check();
    const expired = () => { setUser(null); setError('Your session has ended. Please sign in again.'); };
    window.addEventListener('session-expired', expired);
    const focus = () => { api('auth/me').then(({ user }) => setUser(user)).catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('focus', focus); };
  }, []);
  if (loading) return <div className="auth-loading" role="status"><Flower2 size={40}/><p>Opening your committee book…</p></div>;
  if (!user) return <SignIn onAuthenticated={setUser} connectionError={error} onRetry={check}/>;
  return children(user, () => setUser(null));
}
function SignIn({ onAuthenticated, connectionError, onRetry }) {
  const [mode, setMode] = useState('login'), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [passcode, setPasscode] = useState(''), [confirm, setConfirm] = useState('');
  const joining = new URLSearchParams(location.hash.slice(1)).has('join');
  const signup = mode === 'register';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (signup && passcode !== confirm) { setError('Your passcodes do not match. Please try again.'); return; }
    setBusy(true); setError('');
    try {
      const email = new FormData(event.currentTarget).get('email');
      onAuthenticated((await api(`auth/${mode}`, { email, passcode })).user);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  function switchMode(next) { setMode(next); setError(''); setPasscode(''); setConfirm(''); }
  return <div className="auth-page">
    <header className="topbar"><div className="top-inner"><Brand/><span className="auth-tagline">Thori bachat. Bari khushiyan.</span></div></header>
    <main className="auth-layout">
      <section className="auth-story">
        <span className="auth-eyebrow"><Flower2 size={17}/> YOUR PEOPLE. YOUR COMMITTEE.</span>
        <span lang="ur" className="urdu">اپنی کمیٹی، اپنا بھروسا</span>
        <h1>A little every month.<br/>A big moment,<br/><em>together.</em></h1>
        <p>Your own committee book, a clear record of every rupee, and a little joy when your parchi opens.</p>
        <div className="auth-chits" aria-hidden="true"><span><Ticket size={26}/><b>Apni baari.</b><small>One share. One happy moment.</small></span><span lang="ur">بسم اللہ</span></div>
        <div className="auth-promises"><span><LockKeyhole size={18}/> Private to your circle</span><span><Users size={18}/> Led by your Bukki</span></div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        {joining && <div className="invite-notice"><Users size={19}/><span>You have a committee invitation.<small>Sign in or create an account to join automatically.</small></span></div>}
        <div className="auth-switch" aria-label="Account access"><button type="button" aria-pressed={!signup} disabled={busy} onClick={() => switchMode('login')}>Sign in</button><button type="button" aria-pressed={signup} disabled={busy} onClick={() => switchMode('register')}>Create account</button></div>
        <div className="auth-form-heading" key={mode}><span className="auth-lock"><LockKeyhole size={22}/></span><h2 id="auth-title">{signup ? 'Apna khata kholein.' : 'Welcome back, apnay.'}</h2><p>{signup ? 'Just your email and four little digits to get started.' : 'Your people and your progress, right where you left them.'}</p></div>
        <form onSubmit={submit}>
          <label htmlFor="auth-email">Email address</label><div className="input-with-icon"><Mail size={18}/><input id="auth-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required maxLength={254} disabled={busy}/></div>
          <label htmlFor="auth-passcode">{signup ? 'Choose a 4-digit passcode' : 'Your 4-digit passcode'}</label><div className="input-with-icon passcode-field"><LockKeyhole size={18}/><input id="auth-passcode" name="passcode" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete={signup ? 'new-password' : 'current-password'} value={passcode} onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))} placeholder="••••" required disabled={busy}/><button type="button" className="icon-button" aria-label={visible ? 'Hide passcode' : 'Show passcode'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
          {signup && <><label htmlFor="auth-confirm">Confirm passcode</label><input id="auth-confirm" className="confirm-passcode" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="••••" required disabled={busy}/></>}
          {(error || connectionError) && <div className="error" role="alert">{error || connectionError}{connectionError && <button type="button" onClick={onRetry}>Retry</button>}</div>}
          <button className="primary auth-submit" disabled={busy} aria-busy={busy}>{busy ? <><RefreshCw size={18} className="spin"/> Opening your book…</> : <>{signup ? 'Bismillah, let’s begin' : joining ? 'Sign in & join committee' : 'Open my committee book'}<ArrowRight size={18}/></>}</button>
        </form>
        <p className="auth-footnote"><LockKeyhole size={14}/>{signup ? 'Keep your passcode safe. Email recovery is not available yet.' : 'Your account stays signed in on this device. Sign out on shared devices.'}</p>
      </section>
    </main>
  </div>;
}
