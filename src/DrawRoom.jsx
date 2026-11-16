import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, PartyPopper, Shuffle, Ticket } from 'lucide-react';

const money = n => 'Rs ' + new Intl.NumberFormat('en-PK').format(n);
const month = value => new Date(value + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const progressKey = (committeeId, roundId) => `apni-draw-v2:${committeeId}:${roundId}`;
function savedCount(key, total) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Number.isInteger(value?.opened) ? Math.max(0, Math.min(total, value.opened)) : 0;
  } catch { return 0; }
}

export default function DrawRoom({ committee, round, busy, blocked, onDraw, onLedger }) {
  const key = progressKey(committee.id, round.id);
  const random = round.draw?.type === 'random';
  const order = random ? round.draw.order : [];
  const fixedWinner = round.winner && !random;
  const [opened, setOpened] = useState(() => savedCount(key, order.length));
  const [phase, setPhase] = useState(() => {
    if (fixedWinner || round.paidAt) return 'complete';
    if (!random) return 'idle';
    const count = savedCount(key, order.length);
    return count === order.length ? 'complete' : count ? 'ready' : 'shuffling';
  });
  const actionRef = useRef(null);
  const inFlight = useRef(false);
  const previousWinners = new Set(committee.rounds.filter(r => r.id !== round.id).map(r => r.winner));
  const pool = committee.entries.filter(e => !previousWinners.has(e.id));
  const pot = committee.entries.length * committee.amount;
  const entry = id => committee.entries.find(e => e.id === id);
  const winnerVisible = phase === 'complete';
  const remaining = random ? Math.max(0, order.length - opened) : pool.length;
  const active = phase === 'revealed' || winnerVisible ? entry(order[opened - 1]) : null;

  useEffect(() => {
    if (!random) return;
    try { localStorage.setItem(key, JSON.stringify({ opened })); } catch { /* The saved server result still prevents a reroll. */ }
  }, [key, opened, random]);

  useEffect(() => {
    if (phase !== 'shuffling' || !random) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setPhase('ready'), reduced ? 0 : 2600);
    return () => clearTimeout(timer);
  }, [phase, random]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      setOpened(n => n + 1);
      setPhase(opened + 1 === order.length ? 'complete' : 'revealed');
      inFlight.current = false;
      requestAnimationFrame(() => actionRef.current?.focus({ preventScroll: true }));
    }, reduced ? 0 : 850);
    return () => clearTimeout(timer);
  }, [phase, opened, order.length]);

  async function begin() {
    if (inFlight.current || busy || blocked) return;
    inFlight.current = true;
    setPhase('shuffling');
    const result = await onDraw();
    inFlight.current = false;
    if (!result) setPhase('idle');
  }

  function openNext() {
    if (inFlight.current || !random || opened >= order.length) return;
    inFlight.current = true;
    setPhase('opening');
  }

  const eliminated = order.slice(0, Math.min(opened, order.length - 1));
  return <section className="draw-section ceremony">
    <div className="draw-heading">
      <span lang="ur" className="urdu">بسم اللہ، پرچی نکالیں</span>
      <h2>{winnerVisible ? 'Aaj ki khushkhabri!' : 'Aaram se. Ek parchi, ek pal.'}</h2>
      <p>{month(round.month)} / {fixedWinner ? round.draw?.type === 'historical' ? 'A winner recorded from your existing committee.' : 'The first committee belongs to the Bukki.' : 'Fold. Mix. Open. Let every name have its moment.'}</p>
    </div>

    {winnerVisible ? <div className="winner-banner">
      <PartyPopper size={30}/>
      <span>This month’s winner<strong>{entry(round.winner)?.name}</strong><small>Entry {entry(round.winner)?.share} receives {money(pot)}</small></span>
      <span lang="ur" className="urdu">مبارک ہو!</span>
    </div> : <>
      <div className="ceremony-meta"><span><Ticket size={18}/>{remaining} folded {remaining === 1 ? 'chit' : 'chits'} in the pool</span><span>{opened} opened</span></div>
      <div className={'folded-pool ' + (phase === 'shuffling' ? 'is-shuffling' : '')} aria-label={`${remaining} folded chits. Names stay hidden until opened.`} aria-busy={phase === 'shuffling'}>
        {Array.from({ length: remaining }, (_, i) => <div className="folded-chit" aria-hidden="true" key={i} style={{ '--mix-delay': `${-(i % 7) * 0.11}s`, '--rest-angle': `${(i % 5 - 2) * 5}deg` }}><span className="paper-fold"/><FlowerSeal/></div>)}
      </div>
      <div className="opening-stage" aria-live="polite" aria-atomic="true">
        {phase === 'shuffling' ? <><Shuffle size={26}/><h3>Achhi tarah mila lein…</h3><p>All names are folded away. Mixing the chits.</p></> :
          phase === 'opening' ? <div className="unfolding-chit"><span className="unfold-flap"/><Ticket size={28}/><span>Opening your chit…</span></div> :
          phase === 'revealed' && active ? <div className="opened-chit" key={active.id}><small>Drawn out of this month’s pool</small><h3>{active.name}</h3><span>Entry {active.share}</span><p>{remaining === 1 ? 'Just one folded chit remains. Who will it be?' : `${remaining} chits remain. Their chance is still alive.`}</p></div> :
          <><Ticket size={26}/><h3>{phase === 'idle' ? 'Sab ki parchiyan tayyar hain.' : opened ? 'Your ceremony is ready to continue.' : 'The chits are mixed. Shall we open one?'}</h3><p>No rush. You choose when the next chit opens.</p></>}
      </div>
    </>}

    <div className="draw-controls">
      {winnerVisible ? <><button className="primary" ref={actionRef} onClick={onLedger}>View collections & payout <ArrowRight size={18}/></button><p>{round.paidAt ? 'Payout recorded.' : `Collect ${money(pot)} and record the transfer to complete this month.`}</p></> :
        phase === 'idle' ? blocked ? <><button className="primary" onClick={onLedger}>Settle catch-up balances <ArrowRight size={18}/></button><p>Collect earlier contributions and pay the extra amounts to previous winners before drawing again.</p></> : <><button className="primary" disabled={busy} onClick={begin}><Shuffle size={20}/>{busy ? 'Preparing chits…' : 'Shuffle & draw'}</button><p>The result is saved securely before you open the first chit.</p></> :
          phase === 'shuffling' || phase === 'opening' ? <p role="status">{phase === 'shuffling' ? 'Mixing the folded chits…' : 'Unfolding this chit…'}</p> :
            <><button className="primary" ref={actionRef} onClick={openNext}><Ticket size={20}/>{remaining === 1 ? 'Open the last chit' : opened ? 'Next elimination: open a chit' : 'Pick & open the first chit'}</button><p>{remaining === 1 ? 'The last name standing receives this month’s committee.' : 'Only this chit will open. The rest stay folded.'}</p></>}
    </div>

    {eliminated.length > 0 && <section className="opened-history"><h3>Khuli hui parchiyan</h3><p>These entries are out of this month’s draw.</p><ol className="opened-list">{eliminated.map(id => <li key={id}><Check size={16}/><span>{entry(id)?.name}<small>Entry {entry(id)?.share}</small></span></li>)}</ol></section>}
    {winnerVisible && random && <details className="audit"><summary>View saved draw order</summary><ol>{order.map((id, i) => <li key={id}>{entry(id)?.name}, entry {entry(id)?.share} ({i === order.length - 1 ? 'winner' : 'eliminated'})</li>)}</ol><small>Saved {new Date(round.draw.at).toLocaleString()}</small></details>}
  </section>;
}

function FlowerSeal() { return <span className="chit-seal" aria-hidden="true">اپنی</span>; }
