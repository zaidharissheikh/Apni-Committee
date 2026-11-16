import React, { useState } from 'react';
import Select from './Select.jsx';
import { api } from './api.js';
import useDialog from './useDialog.js';
import { ArrowRight, Info, Plus, X } from 'lucide-react';

const money = n => 'Rs ' + new Intl.NumberFormat('en-PK').format(n);
const month = value => new Date(value + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
function monthAt(start, offset) {
  if (!/^\d{4}-\d{2}$/.test(start)) return '';
  const [year, m] = start.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}

export default function CreateCommittee({ onClose, onCreate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [members, setMembers] = useState([{ name: '', entries: 1 }, { name: '', entries: 1 }]);
  const [bukki, setBukki] = useState(0), [first, setFirst] = useState(true), [amount, setAmount] = useState(5000);
  const [start, setStart] = useState(today.slice(0, 7));
  const [existing, setExisting] = useState(false), [historyCount, setHistoryCount] = useState(1), [history, setHistory] = useState([]), [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const { dialog, close } = useDialog(onClose, busy);
  const total = members.reduce((n, m) => n + Number(m.entries || 0), 0);
  const [sy, sm] = (start || today.slice(0, 7)).split('-').map(Number);
  const [cy, cm] = today.slice(0, 7).split('-').map(Number);
  const availableMonths = Math.max(0, Math.min(total, (cy - sy) * 12 + cm - sm + 1));
  const count = existing ? Math.max(0, Math.min(Number(historyCount) || 0, availableMonths)) : 0;
  const rows = Array.from({ length: count }, (_, i) => ({ memberIndex: i === 0 && first ? String(bukki) : history[i]?.memberIndex ?? '', paidAt: history[i]?.paidAt || '' }));

  function edit(i, field, value) { setMembers(ms => ms.map((m, j) => j === i ? { ...m, [field]: value } : m)); setConfirmed(false); }
  function editHistory(i, field, value) {
    setHistory(previous => { const next = [...previous]; next[i] = { ...next[i], [field]: value }; return next; });
    setConfirmed(false);
  }
  function remove(i) {
    setMembers(ms => ms.filter((_, j) => j !== i));
    setBukki(b => b === i ? 0 : b > i ? b - 1 : b);
    setHistory([]); setConfirmed(false);
  }
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (busy) return;
    if (existing && (!count || !confirmed)) { setError('Choose the completed months and confirm that their contributions and payouts are settled.'); return; }
    if (rows.some(row => row.memberIndex === '')) { setError('Choose a winner for every completed month.'); return; }
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const value = await api('committees', {
        name: data.get('name'), amount, start, members, bukkiIndex: bukki, bukkiFirst: first,
        history: rows.map(row => ({ memberIndex: Number(row.memberIndex), settled: true, ...(row.paidAt ? { paidAt: row.paidAt } : {}) }))
      });
      onCreate(value);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="create-dialog" aria-labelledby="create-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
    <form onSubmit={submit}>
      <div className="section-heading"><div><h2 id="create-title">Nayi committee, nayi shuruaat.</h2><p>Starting fresh or bringing your committee online?</p></div><button type="button" className="icon-button" aria-label="Close committee form" disabled={busy} onClick={close}><X/></button></div>
      <label>Committee name<input name="name" required maxLength={80} placeholder="e.g. Ghar walon ki committee"/></label>
      <div className="form-grid"><label>Monthly amount per entry (Rs)<input type="number" required min="1" max="10000000" step="1" value={amount} onChange={e => setAmount(e.target.value)}/></label><label>Original starting month<input type="month" required min="2000-01" max="2100-12" value={start} onChange={e => { setStart(e.target.value); setConfirmed(false); }}/></label></div>
      <div className="section-heading"><h3>Our members</h3><span>{total} entries = {total} months</span></div>
      <div className="member-form-labels"><span>Member name</span><span>Entries</span><span>Bukki</span></div>
      {members.map((m, i) => <div className="member-form-row" key={i}>
        <input aria-label={`Member ${i + 1} name`} value={m.name} required maxLength={60} placeholder={i === 0 ? 'Your name (Bukki)' : 'Member name'} onChange={e => edit(i, 'name', e.target.value)}/>
        <input aria-label={`Member ${i + 1} entries`} type="number" min="1" max="12" required value={m.entries} onChange={e => edit(i, 'entries', e.target.value)}/>
        <input type="radio" name="bukki" aria-label={`Select member ${i + 1} as Bukki`} checked={bukki === i} onChange={() => { setBukki(i); setConfirmed(false); }}/>
        <button type="button" className="icon-button" aria-label={`Remove member ${i + 1}`} disabled={members.length <= 2} onClick={() => remove(i)}><X size={17}/></button>
      </div>)}
      <button type="button" className="text-button add-member" disabled={members.length >= 100} onClick={() => setMembers([...members, { name: '', entries: 1 }])}><Plus size={18}/> Add another member</button>
      <label className="checkbox-label"><input type="checkbox" checked={first} onChange={e => { setFirst(e.target.checked); setConfirmed(false); }}/><span>Give the first committee to the Bukki<small>Uses one Bukki entry. Other shares join future draws.</small></span></label>

      <section className="import-section">
        <label className="checkbox-label"><input type="checkbox" checked={existing} onChange={e => { setExisting(e.target.checked); setConfirmed(false); }}/><span>This committee has already started<small>Bring completed months and their winners into your ledger.</small></span></label>
        {existing && <div className="import-fields">
          <p className="helper"><Info size={16}/> Use the original start month above. Enter completed months in order; each winner uses one of their shares.</p>
          {availableMonths === 0 ? <p className="error" role="alert">Choose a starting month on or before this month to add previous winners.</p> : <>
            <label className="history-count">How many months are fully settled?<input type="number" min="1" max={availableMonths} required value={historyCount} onChange={e => { setHistoryCount(e.target.value); setConfirmed(false); }}/></label>
            {rows.map((row, i) => {
              const usedBefore = index => rows.slice(0, i).filter(r => r.memberIndex === String(index)).length;
              const dateMonth = monthAt(start, i);
              return <fieldset className="past-winner" key={dateMonth}>
                <legend>{month(dateMonth)}</legend>
                <div className="select-field"><span>Who received this committee?</span><Select label={`Winner for ${month(dateMonth)}`} required value={row.memberIndex} disabled={i === 0 && first} onChange={value => editHistory(i, 'memberIndex', value)} options={[{value:'',label:'Choose a member',disabled:true},...members.map((m,index)=>({value:String(index),label:(m.name || `Member ${index+1}`)+(index === bukki ? ' (Bukki)' : ''),description:`${Math.max(0, Number(m.entries) - usedBefore(index))} shares available`,disabled:usedBefore(index)>=Number(m.entries)}))]}/></div>
                <label>Payout date (optional)<input type="date" aria-label={`Payout date for ${month(dateMonth)}`} min={dateMonth + '-01'} max={today} value={row.paidAt} onChange={e => editHistory(i, 'paidAt', e.target.value)}/></label>
              </fieldset>;
            })}
            <label className="checkbox-label import-confirm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>I confirm these months were fully collected and their winners paid.<small>They will be marked as imported and settled. Leave unknown payout dates blank.</small></span></label>
          </>}
        </div>}
      </section>

      <div className="form-summary"><span>Monthly pot <b>{money(total * Number(amount || 0))}</b></span><span>Session length <b>{total} months</b></span>{existing && <span>Already settled <b>{count} months</b></span>}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="helper">You will manage this committee as its Bukki. Add people and assign shares before the first collection or random draw.</p>
      <button className="primary form-submit" disabled={busy}>{busy ? 'Saving committee…' : existing ? 'Bring my committee online' : 'Bismillah, start committee'}<ArrowRight size={18}/></button>
    </form>
  </dialog>;
}
