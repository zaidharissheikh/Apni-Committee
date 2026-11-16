import React, { useEffect, useState } from 'react';
import { Check, Copy, Link, RefreshCw, ShieldCheck, X } from 'lucide-react';
import Select from './Select.jsx';
import { api } from './api.js';
import useDialog from './useDialog.js';

export default function InviteCommittee({ committee, onClose }) {
  const [memberId, setMemberId] = useState(''), [link, setLink] = useState(''), [expires, setExpires] = useState(0);
  const [entries, setEntries] = useState(1);
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const { dialog, close } = useDialog(onClose, busy);
  const target = committee.members.find(m => m.id === memberId);
  const addsEntries = !target?.entries;
  const allocation = addsEntries ? Number(entries) : target.entries;
  const valid = Number.isInteger(allocation) && allocation >= 1 && allocation <= 12 && (!addsEntries || committee.entries.length + allocation <= 120);
  const settled = committee.rounds.filter(r => r.paidAt).length;
  const money = amount => 'Rs ' + new Intl.NumberFormat('en-PK').format(amount);
  const ending = (() => { const [year, m] = committee.start.split('-').map(Number); return new Date(Date.UTC(year, m - 1 + committee.entries.length + (addsEntries && valid ? allocation : 0) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); })();
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2400); return () => clearTimeout(timer); }, [copied]);
  async function generate() {
    setBusy(true); setError(''); setNotice(''); setCopied(false);
    try {
      const result = await api(`committees/${committee.id}/invites`, { memberId: memberId || null, entries: allocation });
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
    <div className="field-label" id="invite-for-label">Who is this invitation for?</div><Select label="Invitation member" value={memberId} disabled={busy} options={[{ value: '', label: 'Someone new', description: 'Join with the entries you choose below' }, ...committee.members.filter(m => m.id !== committee.bukkiId && !m.linked).map(m => ({ value: m.id, label: m.name, description: m.entries ? `Connect their existing ${m.entries} ${m.entries === 1 ? 'entry' : 'entries'}` : 'Assign entries when their account joins' }))]} onChange={value => { setMemberId(value); setLink(''); setCopied(false); setNotice(''); }}/>
    <label className="invite-entry-field" htmlFor="invite-entries">Entries for this person<input id="invite-entries" type="number" inputMode="numeric" min="1" max={addsEntries ? Math.min(12, 120 - committee.entries.length) : 12} value={addsEntries ? entries : target.entries} disabled={busy || !addsEntries} onChange={e => { setEntries(e.target.value); setLink(''); setCopied(false); }} aria-describedby="invite-entry-help"/></label>
    <p id="invite-entry-help" className="invite-entry-help">{addsEntries ? 'Each entry adds one chit, one monthly contribution and one month to the session. The entries are assigned automatically when this link is used.' : 'This link connects their existing entries; the pot and schedule stay as they are.'}</p>
    {valid && <div className="invite-allocation" aria-live="polite"><span>Monthly contribution<b>{money(allocation * committee.amount)}</b></span><span>{addsEntries ? 'Pot after joining' : 'Monthly pot'}<b>{money((committee.entries.length + (addsEntries ? allocation : 0)) * committee.amount)}</b></span><span>Session ends<b>{ending}</b></span>{addsEntries && settled > 0 && <span>Catch-up for {settled} settled {settled === 1 ? 'month' : 'months'}<b>{money(settled * allocation * committee.amount)}</b></span>}</div>}
    {addsEntries && settled > 0 && <p className="invite-entry-help">Catch-up is calculated from the settled months at the time they join. Their earlier contributions and the matching extra payouts to previous winners will be added to the ledger. Settle them before the next draw or payout.</p>}
    {!valid && <p className="error" role="alert">Choose 1–12 entries without exceeding 120 entries in the committee.</p>}
    <div className="invite-permissions"><ShieldCheck size={21}/><p><b>You stay the Bukki.</b><br/>Members can view the overview, members and ledger. Draws, collections, shares and invitations stay with you.</p></div>
    <button className="primary" disabled={busy || !valid} onClick={generate} aria-busy={busy}>{busy ? <RefreshCw size={17} className="spin"/> : <Link size={17}/>} {link ? 'Create another invitation' : 'Create invite link'}</button>
    {link && <div className="generated-invite"><label htmlFor="invite-link">Your invitation link</label><div className="copy-field"><input id="invite-link" value={link} readOnly onFocus={e => e.target.select()}/><button className="secondary" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Copied!' : 'Copy'}</button></div><small>For one person with {allocation} {allocation === 1 ? 'entry' : 'entries'}. Expires {new Date(expires).toLocaleDateString('en-GB')}. Share it directly with that person.</small><span className="sr-only" role="status">{copied ? 'Invite link copied.' : ''}</span></div>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success-notice" role="status">{notice}</p>}
    <div className="invite-revoke"><p>Need to stop new joins?</p><button className="text-button" disabled={busy} onClick={revoke}>Revoke all invite links</button></div>
  </dialog>;
}
