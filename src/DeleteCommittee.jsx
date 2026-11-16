import React, { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { api } from './api.js';
import useDialog from './useDialog.js';

export default function DeleteCommittee({ committee, disabled, onDeleted }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="delete-committee secondary" disabled={disabled} onClick={() => setOpen(true)}><Trash2 size={16}/> Delete committee</button>
    {open && <DeleteConfirmation committee={committee} onClose={() => setOpen(false)} onDeleted={onDeleted}/>}
  </>;
}

function DeleteConfirmation({ committee, onClose, onDeleted }) {
  const locked = useRef(false);
  const [name, setName] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const { dialog, close } = useDialog(onClose, pending);

  async function remove(e) {
    e.preventDefault();
    if (locked.current || name !== committee.name) return;
    locked.current = true; setPending(true); setError('');
    try {
      const result = await api(`committees/${committee.id}`, { confirmationName: name }, 'DELETE');
      try {
        const prefix = `apni-draw-v2:${committee.id}:`;
        Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
      } catch { /* Browser storage is optional; server deletion has succeeded. */ }
      onDeleted(result.deletedId);
      onClose();
    } catch (e) { setError(e.message); } finally { locked.current = false; setPending(false); }
  }

  return <dialog ref={dialog} className="create-dialog delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-explanation" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
    <form onSubmit={remove}>
      <div className="section-heading"><h2 id="delete-title">Delete this committee?</h2><button type="button" className="icon-button" aria-label="Close delete confirmation" disabled={pending} onClick={close}><X size={20}/></button></div>
      <p id="delete-explanation">This permanently removes <strong>{committee.name}</strong>, its members, saved draws, collections, and payout history. This cannot be undone.</p>
      <label htmlFor="delete-confirmation-name">Type the committee name to confirm<input id="delete-confirmation-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" spellCheck={false} disabled={pending} aria-describedby="delete-name-hint" required/></label>
      <p id="delete-name-hint" className="helper">Enter exactly: {committee.name}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="delete-actions"><button type="button" className="secondary" autoFocus disabled={pending} onClick={close}>Keep committee</button><button className="primary" disabled={pending || name !== committee.name} aria-busy={pending}><Trash2 size={18}/>{pending ? 'Deleting…' : 'Delete permanently'}</button></div>
    </form>
  </dialog>;
}
