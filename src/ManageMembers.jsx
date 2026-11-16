import React, { useState } from 'react';
import { Plus, UserPlus, Check, Info } from 'lucide-react';

export default function ManageMembers({ committee, busy, onAction }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [entries, setEntries] = useState('1');
  const [notice, setNotice] = useState('');
  async function submit(e) {
    e.preventDefault();
    const result = await onAction('members', { name, entries: committee.sharesLocked ? 0 : Number(entries) });
    if (result) { setName(''); setAdding(false); setNotice('Member added. Use Invite members to connect their account.'); }
  }
  return <section className="manage-members" aria-label="Bukki member controls">
    <div className="section-heading"><div><h3>Your circle, your call.</h3><p>Add people manually or assign shares to invited members.</p></div><button className="secondary" disabled={busy} onClick={() => setAdding(!adding)} aria-expanded={adding}><UserPlus size={17}/>{adding ? 'Cancel' : 'Add member'}</button></div>
    {adding && <form className="add-member-form" onSubmit={submit}><label>Member name<input aria-label="New member name" value={name} onChange={e => setName(e.target.value)} required maxLength={60} disabled={busy} autoFocus/></label><label>Shares<input aria-label="New member shares" type="number" min="0" max="12" value={committee.sharesLocked ? 0 : entries} onChange={e => setEntries(e.target.value)} disabled={busy || committee.sharesLocked} required/></label><button className="primary" disabled={busy}><Plus size={17}/>{busy ? 'Saving…' : 'Add member'}</button></form>}
    {committee.members.filter(m => m.entries === 0).map(m => <ShareAssignment key={m.id} member={m} locked={committee.sharesLocked} busy={busy} onAction={onAction}/>)}
    <p className="helper"><Info size={16}/>{committee.sharesLocked ? 'Draws or collections have started, so shares are locked. New members can still view; invite an existing member to connect their current shares.' : 'Assign shares before the first collection or random draw. Each new share adds one month; use 0 shares for viewing access.'}</p>
    {notice && <p className="success-notice" role="status"><Check size={16}/>{notice}</p>}
  </section>;
}
function ShareAssignment({ member, locked, busy, onAction }) {
  const [entries, setEntries] = useState('1');
  return <form className="share-assignment" onSubmit={e => { e.preventDefault(); onAction('shares', { memberId: member.id, entries: Number(entries) }); }}><span><b>{member.name}</b><small>Viewing access · no shares assigned</small></span>{!locked && <><label className="sr-only" htmlFor={`shares-${member.id}`}>Shares for {member.name}</label><input id={`shares-${member.id}`} type="number" min="1" max="12" value={entries} onChange={e => setEntries(e.target.value)} disabled={busy} required/><button className="secondary compact" disabled={busy}>Assign shares</button></>}</form>;
}
