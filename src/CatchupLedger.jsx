import React, { useState } from 'react';
import { Check, Info, Wallet } from 'lucide-react';
import { adjustmentTotals, monthlyPot } from '../shared/ledger.js';

const money = amount => 'Rs ' + new Intl.NumberFormat('en-PK').format(amount);
const month = value => new Date(value + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default function CatchupLedger({ committee, busy, onAction }) {
  const [showSettled, setShowSettled] = useState(false);
  const items = committee.rounds.flatMap(round => (round.shareAdjustments || []).map(adjustment => ({ round, adjustment })));
  const totals = adjustmentTotals(committee), admin = committee.role === 'bukki';
  if (!items.length) return null;
  return <section className="catchup-section" aria-labelledby="catchup-title">
    <div className="section-heading"><div><h2 id="catchup-title">New entries. Poora hisaab.</h2><p>Earlier contributions and extra payouts keep everyone’s committee equal.</p></div><Wallet size={24}/></div>
    <div className="catchup-totals"><span>Catch-up contributions due<strong>{money(totals.contributionsDue)}</strong></span><span>Extra payouts due<strong>{money(totals.payoutsDue)}</strong></span><span>Updated monthly pot<strong>{money(monthlyPot(committee))}</strong></span></div>
    <p className="helper"><Info size={16}/>{admin ? 'Record the contribution from the new member, then confirm the matching transfer to that month’s winner. Settle these balances before the next draw or regular payout.' : 'The Bukki records each catch-up contribution and its matching extra payout here.'}</p>
    <label className="checkbox-label catchup-filter"><input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)}/> Show settled adjustments</label>
    <div className="catchup-list">{items.filter(({ adjustment }) => showSettled || !adjustment.paidAt).map(({ round, adjustment: a }) => {
      const member = committee.members.find(m => m.id === a.memberId);
      const winner = committee.entries.find(e => e.id === round.winner);
      return <article className="catchup-card" key={a.id}>
        <div className="catchup-card-heading"><h3>{month(round.month)}</h3><span>{member?.name} · {a.entries} new {a.entries === 1 ? 'entry' : 'entries'}</span></div>
        <div className="catchup-transfer"><div><small>Collect from {member?.name}</small><strong>{money(a.amount)}</strong><span className={'payment-state ' + (a.collectedAt ? 'paid' : 'pending')}>{a.collectedAt ? <><Check size={14}/> Collected</> : 'Due'}</span>{admin && !a.paidAt && <button className="secondary compact" disabled={busy} onClick={() => onAction('catchup', { roundId: round.id, adjustmentId: a.id, paid: !a.collectedAt })}>{a.collectedAt ? 'Undo catch-up collection' : 'Mark catch-up collected'}</button>}</div>
          <div><small>Extra payout to {winner?.name}</small><strong>{money(a.amount)}</strong><span className={'payment-state ' + (a.paidAt ? 'paid' : 'pending')}>{a.paidAt ? <><Check size={14}/> Paid</> : 'Pending'}</span>{admin && !a.paidAt && <button className="primary compact" disabled={busy || !a.collectedAt} onClick={() => onAction('topup', { roundId: round.id, adjustmentId: a.id })}>Confirm extra payout</button>}</div></div>
        {a.paidAt && <small className="catchup-paid-date">Extra payout recorded {new Date(a.paidAt).toLocaleDateString('en-GB')}</small>}
      </article>;
    })}</div>
    {!totals.pending && !showSettled && <p className="success-notice" role="status"><Check size={18}/> All catch-up contributions and extra payouts are settled.</p>}
  </section>;
}
