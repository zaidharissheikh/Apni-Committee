import { randomInt, randomUUID } from 'node:crypto';
import { collected, adjustmentTotals, monthlyPot } from '../shared/ledger.js';
export { collected } from '../shared/ledger.js';
export const uid = () => randomUUID();
export function createCommittee(input) {
  const name=String(input.name||'').trim(), amount=Number(input.amount);
  if(!name || name.length>80) throw Error('Give your committee a name of 1–80 characters.');
  if(!Number.isSafeInteger(amount)||amount<1||amount>10000000) throw Error('Monthly contribution must be a whole amount between Rs 1 and Rs 10,000,000.');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.start||'') || Number(input.start.slice(0,4))<2000 || Number(input.start.slice(0,4))>2100) throw Error('Choose a valid starting month between 2000 and 2100.');
  if(!Array.isArray(input.members)||input.members.length<2||input.members.length>100) throw Error('Add between 2 and 100 members, including the Bukki.');
  const members=input.members.map(m=>({id:uid(),name:String(m.name||'').trim(),entries:Number(m.entries)}));
  if(members.some(m=>!m.name||m.name.length>60||!Number.isInteger(m.entries)||m.entries<1||m.entries>12)) throw Error('Each member needs a name and 1–12 entries.');
  if(new Set(members.map(m=>m.name.toLowerCase())).size!==members.length) throw Error('Use unique member names so collections stay clear.');
  const total=members.reduce((a,m)=>a+m.entries,0);
  if(total>120) throw Error('A session can have at most 120 entries.');
  const bukki=members[Number(input.bukkiIndex)];
  if(!bukki) throw Error('Choose the Bukki from the members.');
  const entries=members.flatMap(m=>Array.from({length:m.entries},(_,i)=>({id:uid(),memberId:m.id,name:m.name,share:i+1})));
  const [year,month]=input.start.split('-').map(Number);
  const rounds=entries.map((_,i)=>({id:uid(),month:new Date(Date.UTC(year,month-1+i,1)).toISOString().slice(0,7),payments:{},winner:null,paidAt:null,draw:null}));
  if(input.bukkiFirst) { rounds[0].winner=entries.find(e=>e.memberId===bukki.id).id; rounds[0].draw={type:'bukki',order:[],at:new Date().toISOString()}; }
  if(input.history!==undefined) {
    if(!Array.isArray(input.history)||input.history.length>total) throw Error('History must be an array with at most one entry per round.');
    const now=new Date().toISOString(), used=new Set();
    for(let i=0;i<input.history.length;i++) {
      const h=input.history[i], r=rounds[i];
      if(!h||typeof h!=='object'||Array.isArray(h)||!Number.isInteger(h.memberIndex)||h.memberIndex<0||h.memberIndex>=members.length) throw Error('Each historical round needs a valid memberIndex.');
      if(h.settled!==true) throw Error('Each historical round must explicitly confirm settled: true (all contributions collected and paid).');
      if(r.month>now.slice(0,7)) throw Error('Historical rounds cannot be in a future month.');
      if(i===0&&input.bukkiFirst&&members[h.memberIndex].id!==bukki.id) throw Error('The first historical winner must be the Bukki.');
      const winner=entries.find(e=>e.memberId===members[h.memberIndex].id&&!used.has(e.id));
      if(!winner) throw Error('Historical winner has no remaining shares.');
      const known=h.paidAt!==undefined;
      if(known) {
        if(typeof h.paidAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(h.paidAt)) throw Error('Historical paidAt must be a valid calendar date (YYYY-MM-DD).');
        const date=new Date(h.paidAt+'T00:00:00.000Z');
        if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==h.paidAt) throw Error('Historical paidAt must be a valid calendar date (YYYY-MM-DD).');
        if(h.paidAt>now.slice(0,10)||h.paidAt<r.month+'-01') throw Error('Historical paidAt cannot be future or before its round month.');
      }
      used.add(winner.id);
      r.winner=winner.id;
      r.historical=true;
      r.paidAt=known?h.paidAt+'T00:00:00.000Z':now;
      r.paidAtKnown=known;
      r.draw={type:'historical',at:now,order:[],importedAt:now};
      r.payments=Object.fromEntries(members.map(m=>[m.id,{paid:true,at:now,imported:true}]));
    }
  }
  return {id:uid(),name,amount,start:input.start,bukkiId:bukki.id,bukkiFirst:!!input.bukkiFirst,members,entries,rounds,createdAt:new Date().toISOString(),demo:!!input.demo};
}
export function eligible(c) {const winners=new Set(c.rounds.map(r=>r.winner).filter(Boolean));return c.entries.filter(e=>!winners.has(e.id));}
export function currentRound(c) {return c.rounds.find(r=>!r.paidAt);}
export function sharesLocked(c) {
 return c.entries.length>=120;
}
export function assignShares(c,memberId,count) {
 const member=c.members.find(m=>m.id===memberId), entries=Number(count);
 if(!member) throw Error('Member not found.');
 if(member.entries!==0) throw Error('This member already has shares assigned.');
 if(!Number.isInteger(entries)||entries<1||entries>12) throw Error('Assign between 1 and 12 shares.');
 if(c.entries.length+entries>120) throw Error('A session can have at most 120 entries.');
 const oldPot=monthlyPot(c), now=new Date().toISOString();
 for(const round of c.rounds.filter(r=>r.paidAt)) {
  // Preserve the original transfer. Late contributions and the matching extra
  // payouts are new ledger items, never edits to an earlier settlement.
  round.paidAmount??=oldPot;
  (round.shareAdjustments??=[]).push({id:uid(),memberId,entries,amount:entries*c.amount,createdAt:now,collectedAt:null,paidAt:null});
 }
 const [year,month]=c.start.split('-').map(Number);
 for(let i=0;i<entries;i++) {
  const index=c.entries.length;
  c.entries.push({id:uid(),memberId:member.id,name:member.name,share:i+1});
  c.rounds.push({id:uid(),month:new Date(Date.UTC(year,month-1+index,1)).toISOString().slice(0,7),payments:{},winner:null,paidAt:null,draw:null});
 }
 member.entries=entries;
 return member;
}
export function addMember(c,input) {
 if(c.members.length>=100) throw Error('A committee can have at most 100 members.');
 const name=typeof input.name==='string'?input.name.trim():'';
 if(!name||name.length>60) throw Error('Enter a member name of 1–60 characters.');
 if(c.members.some(m=>m.name.toLowerCase()===name.toLowerCase())) throw Error('Use a unique member name.');
 const entries=Number(input.entries);
 if(!Number.isInteger(entries)||entries<0||entries>12) throw Error('Choose between 0 and 12 shares.');
 const member={id:uid(),name,entries:0};
 if(entries) {
  // Validate before changing the committee, including for callers outside a DB transaction.
  if(c.entries.length+entries>120) throw Error('A session can have at most 120 entries.');
 }
 c.members.push(member);
 if(entries) assignShares(c,member.id,entries);
 return member;
}
export function catchup(c,roundId,adjustmentId,paid) {
 const round=c.rounds.find(r=>r.id===roundId), adjustment=round?.shareAdjustments?.find(a=>a.id===adjustmentId);
 if(!round?.paidAt||!adjustment) throw Error('Catch-up contribution not found.');
 if(typeof paid!=='boolean') throw Error('Payment status must be true or false.');
 if(!paid&&adjustment.paidAt) throw Error('This contribution funded a confirmed extra payout and cannot be undone.');
 adjustment.collectedAt=paid?(adjustment.collectedAt||new Date().toISOString()):null;
 return adjustment;
}
export function topup(c,roundId,adjustmentId) {
 const round=c.rounds.find(r=>r.id===roundId), adjustment=round?.shareAdjustments?.find(a=>a.id===adjustmentId);
 if(!round?.paidAt||!adjustment) throw Error('Extra payout not found.');
 if(!adjustment.collectedAt) throw Error('Collect this catch-up contribution before confirming its extra payout.');
 adjustment.paidAt??=new Date().toISOString();
 return adjustment;
}
export function draw(c,roundId) {
 if(adjustmentTotals(c).pending) throw Error('Settle catch-up contributions and extra payouts in the ledger before drawing again.');
 const r=c.rounds.find(x=>x.id===roundId);
 if(!r || r!==currentRound(c)) throw Error('Finish the current month before drawing the next.');
 if(r.winner) throw Error('This month already has a winner.');
 const pool=eligible(c).map(e=>e.id);
 for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 if(!pool.length) throw Error('No entries remain.');
 r.winner=pool.at(-1);r.draw={type:'random',order:pool,at:new Date().toISOString()};return r;
}
export function payment(c,roundId,memberId,paid){
 const r=c.rounds.find(x=>x.id===roundId);
 if(!r||!c.members.some(m=>m.id===memberId)) throw Error('Member or month not found.');
 if(!c.members.find(m=>m.id===memberId).entries) throw Error('This member has viewing access and no contribution due.');
 if(r.paidAt) throw Error('A paid-out month is locked.');
 if(r!==currentRound(c)) throw Error('Record collections in the current month.');
 if(typeof paid!=='boolean') throw Error('Payment status must be true or false.');
 r.payments[memberId]={paid,at:new Date().toISOString()};return r;
}
export function payout(c,roundId){const r=c.rounds.find(x=>x.id===roundId);if(!r||r!==currentRound(c)||!r.winner)throw Error('Draw a winner for the current month first.');if(adjustmentTotals(c).pending)throw Error('Settle catch-up contributions and extra payouts in the ledger before confirming this payout.');if(collected(c,r)!==monthlyPot(c))throw Error('Collect all contributions before confirming the payout.');r.paidAmount=monthlyPot(c);r.paidAt=new Date().toISOString();return r;}
