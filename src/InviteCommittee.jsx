import React, { useEffect, useState } from 'react';
import { Check, Copy, Link, RefreshCw, ShieldCheck, X } from 'lucide-react';
import Select from './Select.jsx';
import { api } from './api.js';
import useDialog from './useDialog.js';

export default function InviteCommittee({ committee, onClose }) {
  const [memberId, setMemberId] = useState(''), [link, setLink] = useState(''), [expires, setExpires] = useState(0);
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const { dialog, close } = useDialog(onClose, busy);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2400); return () => clearTimeout(timer); }, [copied]);
  async function generate() {
    setBusy(true); setError(''); setNotice(''); setCopied(false);
    try {
      const result = await api(`committees/${committee.id}/invites`, { memberId: memberId || null });
      const url = new URL('/', location.origin); url.hash = `join=${result.token}`;
      setLink(url.href); setExpires(result.expiresAt);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function revoke() {
    setBusy(true); setError('');
    try { await api(`committees/${committee.id}/invites`, {}, 'DELETE'); setLink(''); setCopied(false); setNotice('All previous links have been revoked. Existing members keep their access.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setError(''); }
    catch { setError('Copy is unavailable in this browser. Select and copy the link below.'); }
  }
  return <dialog ref={dialog} className="create-dialog invite-dialog" aria-labelledby="invite-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
    <div className="section-heading"><div><span className="dialog-emblem"><Link size={22}/></span><h2 id="invite-title">Apnay logon ko bulayein.</h2><p>Invite someone to {committee.name}.</p></div><button className="icon-button" aria-label="Close invite" disabled={busy} onClick={close}><X size={20}/></button></div>
    <div className="field-label" id="invite-for-label">Who is this invitation for?</div><Select label="Invitation member" value={memberId} disabled={busy} options={[{ value: '', label: 'Someone new', description: 'Join with viewing access; assign shares later' }, ...committee.members.filter(m => m.id !== committee.bukkiId && !m.linked).map(m => ({ value: m.id, label: m.name, description: m.entries ? `Connect their existing ${m.entries} ${m.entries === 1 ? 'share' : 'shares'}` : 'Connect their existing viewing membership' }))]} onChange={value => { setMemberId(value); setLink(''); setCopied(false); setNotice(''); }}/>
    <div className="invite-permissions"><ShieldCheck size={21}/><p><b>You stay the Bukki.</b><br/>Members can view the overview, members and ledger. Draws, collections, shares and invitations stay with you.</p></div>
    <button className="primary" disabled={busy} onClick={generate} aria-busy={busy}>{busy ? <RefreshCw size={17} className="spin"/> : <Link size={17}/>} {link ? 'Create a replacement link' : 'Create invite link'}</button>
    {link && <div className="generated-invite"><label htmlFor="invite-link">Your invitation link</label><div className="copy-field"><input id="invite-link" value={link} readOnly onFocus={e => e.target.select()}/><button className="secondary" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Copied!' : 'Copy'}</button></div><small>Expires {new Date(expires).toLocaleDateString('en-GB')}. {memberId ? 'For one member; share it directly with that person.' : 'Anyone with this link can join with viewing access.'}</small><span className="sr-only" role="status">{copied ? 'Invite link copied.' : ''}</span></div>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success-notice" role="status">{notice}</p>}
    <div className="invite-revoke"><p>Need to stop new joins?</p><button className="text-button" disabled={busy} onClick={revoke}>Revoke all invite links</button></div>
  </dialog>;
}
