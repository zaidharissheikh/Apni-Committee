import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommittee,currentRound,draw,payment,payout,eligible,collected,addMember,assignShares,sharesLocked,catchup,topup} from '../server/domain.js';
import {adjustmentTotals,paidOut,monthlyPot,memberPaid} from '../shared/ledger.js';
const make=(extra={})=>createCommittee({name:'Test family',amount:5000,start:'2026-12',bukkiIndex:0,bukkiFirst:true,members:[{name:'Bukki',entries:2},{name:'Member B',entries:1},{name:'Member C',entries:1}],...extra});
const historical=(history,extra={})=>make({start:'2020-11',history,...extra});
test('history imports contiguous months across years and consumes distinct shares',()=>{
 const c=historical([{memberIndex:0,settled:true},{memberIndex:0,settled:true},{memberIndex:1,settled:true}]);
 assert.deepEqual(c.rounds.map(r=>r.month),['2020-11','2020-12','2021-01','2021-02']);
 assert.deepEqual(c.rounds.slice(0,3).map(r=>c.entries.find(e=>e.id===r.winner).share),[1,2,1]);
 assert.equal(new Set(c.rounds.slice(0,3).map(r=>r.winner)).size,3);
 assert.equal(currentRound(c),c.rounds[3]);
 assert.deepEqual(eligible(c).map(e=>e.memberId),[c.members[2].id]);
 assert.equal(c.rounds[3].paidAt,null);
 assert.deepEqual(c.rounds[3].payments,{});
 const remaining=eligible(c)[0].id;
 assert.equal(draw(c,c.rounds[3].id).winner,remaining);
});
test('history records explicit settlement and distinguishes unknown payout dates',()=>{
 const c=historical([{memberIndex:0,settled:true,paidAt:'2020-11-20'},{memberIndex:1,settled:true}]);
 const [dated,unknown]=c.rounds;
 assert.equal(dated.paidAt,'2020-11-20T00:00:00.000Z');
 assert.equal(dated.paidAtKnown,true);
 assert.equal(unknown.paidAtKnown,false);
 assert.equal(unknown.paidAt,unknown.draw.importedAt);
 for(const r of [dated,unknown]) {
  assert.equal(r.historical,true);
  assert.deepEqual(r.draw,{type:'historical',at:r.draw.importedAt,order:[],importedAt:r.draw.importedAt});
  assert.equal(collected(c,r),20000);
  for(const m of c.members) assert.deepEqual(r.payments[m.id],{paid:true,at:r.draw.importedAt,imported:true});
  assert.throws(()=>payment(c,r.id,c.bukkiId,false),/locked/);
 }
 for(const settled of [undefined,false,'true',1,null]) assert.throws(()=>historical([{memberIndex:0,settled}]),/settled/);
});
test('history rejects exhausted shares and first winner Bukki mismatch',()=>{
 assert.throws(()=>historical([0,0,0].map(memberIndex=>({memberIndex,settled:true}))),/remaining shares/);
 assert.throws(()=>historical([{memberIndex:1,settled:true}]),/Bukki/);
 assert.equal(historical([{memberIndex:1,settled:true}],{bukkiFirst:false}).rounds[0].historical,true);
});
test('history rejects future months but accepts current UTC month',()=>{
 const now=new Date(), current=now.toISOString().slice(0,7);
 const future=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,7);
 assert.equal(historical([{memberIndex:0,settled:true}],{start:current}).rounds[0].historical,true);
 assert.throws(()=>historical([{memberIndex:0,settled:true}],{start:future}),/future month/);
 assert.throws(()=>historical([{memberIndex:0,settled:true},{memberIndex:1,settled:true}],{start:current}),/future month/);
});
test('history validates actual calendar dates and payout date bounds',()=>{
 for(const paidAt of ['2020-11-31','2020-02-30','2021-02-29','2020-13-01','bad','2020-11-1',null,42,'2020-11-20T00:00:00Z']) {
  assert.throws(()=>historical([{memberIndex:0,settled:true,paidAt}]),/calendar date/);
 }
 for(const paidAt of ['2020-10-31','2099-01-01']) assert.throws(()=>historical([{memberIndex:0,settled:true,paidAt}]),/future or before/);
 assert.equal(historical([{memberIndex:0,settled:true,paidAt:'2020-02-29'}],{start:'2020-02'}).rounds[0].paidAtKnown,true);
});
test('history rejects malformed arrays, gaps, invalid indexes and excess rounds',()=>{
 for(const history of [null,{},'history',false,[null],[[]],[{}],new Array(2),[{memberIndex:0,settled:true},undefined]]) assert.throws(()=>historical(history),/History|historical/);
 for(const memberIndex of [-1,3,0.5,'0',null]) assert.throws(()=>historical([{memberIndex,settled:true}]),/memberIndex/);
 assert.throws(()=>historical(Array.from({length:5},()=>({memberIndex:0,settled:true}))),/at most/);
});
test('empty history preserves default Bukki reservation and no collections',()=>{
 const c=historical([]);
 assert.equal(c.rounds[0].draw.type,'bukki');
 assert.equal(currentRound(c),c.rounds[0]);
 assert.equal(collected(c,c.rounds[0]),0);
 assert.equal(c.rounds[0].historical,undefined);
 const complete=historical([0,0,1,2].map(memberIndex=>({memberIndex,settled:true})));
 assert.equal(currentRound(complete),undefined);
 assert.equal(eligible(complete).length,0);
});
test('shares set session length, payment amounts and calendar rollover',()=>{const c=make();assert.equal(c.rounds.length,4);assert.equal(c.rounds[1].month,'2027-01');assert.equal(c.entries.length,4);payment(c,c.rounds[0].id,c.bukkiId,true);assert.equal(collected(c,c.rounds[0]),10000);assert.equal(eligible(c).filter(e=>e.memberId===c.bukkiId).length,1);});
test('full session pays every share exactly once; prior winners still contribute',()=>{const c=make();const winners=[];for(let i=0;i<4;i++){const r=currentRound(c);if(!r.winner)draw(c,r.id);winners.push(r.winner);assert.throws(()=>draw(c,r.id),/already/);assert.throws(()=>payout(c,r.id),/Collect/);c.members.forEach(m=>payment(c,r.id,m.id,true));assert.equal(collected(c,r),20000);payout(c,r.id);assert.throws(()=>payment(c,r.id,c.bukkiId,false),/locked/);}assert.equal(new Set(winners).size,4);assert.equal(eligible(c).length,0);assert.equal(currentRound(c),undefined);});
test('draw audit ends in saved winner and includes every eligible share',()=>{for(let i=0;i<30;i++){const c=make({bukkiFirst:false});const r=draw(c,c.rounds[0].id);assert.equal(new Set(r.draw.order).size,4);assert.equal(r.draw.order.at(-1),r.winner);assert.deepEqual(new Set(r.draw.order),new Set(c.entries.map(e=>e.id)));}});
test('future collections and out of sequence draws are blocked',()=>{const c=make();assert.throws(()=>payment(c,c.rounds[1].id,c.bukkiId,true),/current/);assert.throws(()=>draw(c,c.rounds[1].id),/Finish/);assert.throws(()=>payment(c,c.rounds[0].id,c.bukkiId,'true'),/true or false/);});
test('duplicate names, invalid shares, invalid months and missing Bukki rejected',()=>{assert.throws(()=>make({members:[{name:'a',entries:1},{name:'A',entries:1}]}),/unique/);assert.throws(()=>make({amount:1.5}),/whole/);assert.throws(()=>make({start:'2026-13'}),/valid/);assert.throws(()=>make({bukkiIndex:9}),/Bukki/);assert.throws(()=>make({members:[{name:'a',entries:0},{name:'b',entries:1}]}),/1–12/);});
test('viewing members never change the pot, rounds or collections; their shares can be assigned before activity',()=>{
 const c=make(), originalWinner=c.rounds[0].winner;
 const m=addMember(c,{name:'New viewer',entries:0});
 assert.equal(c.entries.length,4);assert.equal(c.rounds.length,4);assert.equal(collected(c,c.rounds[0]),0);
 assert.equal(sharesLocked(c),false); // A Bukki-first reservation does not prevent setup.
 assert.throws(()=>payment(c,c.rounds[0].id,m.id,true),/viewing access/);
 assignShares(c,m.id,2);
 assert.equal(c.entries.length,6);assert.equal(c.rounds.length,6);assert.equal(c.rounds[0].winner,originalWinner);
 assert.equal(c.rounds.at(-1).month,'2027-05');
 assert.equal(c.entries.filter(e=>e.memberId===m.id).length,2);
 assert.throws(()=>assignShares(c,m.id,1),/already has/);
});
test('late shares preserve saved draws and collections and add adjustments only to paid rounds',()=>{
 for(const type of ['draw','payment','history']) {
  const c=type==='history'?historical([{memberIndex:0,settled:true}]):make({bukkiFirst:false});
  const viewer=addMember(c,{name:'Viewer',entries:0});
  if(type==='draw')draw(c,c.rounds[0].id);
  if(type==='payment')payment(c,c.rounds[0].id,c.bukkiId,true);
  const original=structuredClone(c.rounds[0]);
  assignShares(c,viewer.id,2);
  assert.equal(sharesLocked(c),false);
  assert.equal(c.entries.length,6);assert.equal(c.rounds.length,6);
  assert.deepEqual(c.rounds[0].draw,original.draw);
  assert.deepEqual(c.rounds[0].payments,original.payments);
  assert.equal(c.rounds[0].paidAt,original.paidAt);
  assert.equal(c.rounds[0].shareAdjustments?.length||0,type==='history'?1:0);
  if(type==='history')assert.equal(c.rounds[0].shareAdjustments[0].amount,10000);
 }
});
test('new shares keep full-session fairness and viewers never need collection marks',()=>{
 const c=make({bukkiFirst:false});addMember(c,{name:'Viewer',entries:0});addMember(c,{name:'New payer',entries:2});
 const winners=[];
 while(currentRound(c)) {
  const r=currentRound(c);draw(c,r.id);winners.push(r.winner);
  c.members.filter(m=>m.entries>0).forEach(m=>payment(c,r.id,m.id,true));
  assert.equal(collected(c,r),c.entries.length*c.amount);payout(c,r.id);
 }
 assert.equal(winners.length,c.entries.length);assert.equal(new Set(winners).size,c.entries.length);
});
test('late members owe past contributions and each previous winner receives the matching extra payout',()=>{
 const c=historical([{memberIndex:0,settled:true},{memberIndex:1,settled:true}]);
 const originals=c.rounds.slice(0,2).map(r=>structuredClone(r));
 const viewer=addMember(c,{name:'Late member',entries:0});assignShares(c,viewer.id,2);
 assert.equal(c.entries.length,6);assert.equal(c.rounds.length,6);assert.equal(c.rounds.at(-1).month,'2021-04');
 assert.deepEqual(adjustmentTotals(c),{contributionsDue:20000,payoutsDue:20000,pending:2});
 for(let i=0;i<2;i++) {
  const r=c.rounds[i],a=r.shareAdjustments[0];
  assert.deepEqual(r.draw,originals[i].draw);assert.equal(r.winner,originals[i].winner);assert.equal(r.paidAt,originals[i].paidAt);
  assert.equal(r.paidAmount,20000);assert.equal(paidOut(c,r),20000);assert.equal(collected(c,r),20000);
  assert.equal(a.memberId,viewer.id);assert.equal(a.entries,2);assert.equal(a.amount,10000);
  assert.throws(()=>topup(c,r.id,a.id),/Collect/);
  catchup(c,r.id,a.id,true);assert.equal(collected(c,r),30000);assert.equal(memberPaid(r,viewer.id),true);
  const stamp=a.collectedAt;catchup(c,r.id,a.id,true);assert.equal(a.collectedAt,stamp);
  catchup(c,r.id,a.id,false);assert.equal(collected(c,r),20000);
  catchup(c,r.id,a.id,true);topup(c,r.id,a.id);const paidAt=a.paidAt;topup(c,r.id,a.id);assert.equal(a.paidAt,paidAt);
  assert.equal(paidOut(c,r),30000);assert.throws(()=>catchup(c,r.id,a.id,false),/cannot be undone/);
  assert.throws(()=>payment(c,r.id,viewer.id,true),/locked/);
 }
 assert.deepEqual(adjustmentTotals(c),{contributionsDue:0,payoutsDue:0,pending:0});
});
test('unsettled catch-up balances block new draws and regular payouts until extra transfers are confirmed',()=>{
 const c=historical([{memberIndex:0,settled:true}]);
 const r=currentRound(c);draw(c,r.id);const saved=structuredClone(r.draw),winner=r.winner;
 addMember(c,{name:'Late member',entries:1});
 c.members.forEach(m=>payment(c,r.id,m.id,true));
 assert.throws(()=>payout(c,r.id),/catch-up/);
 const past=c.rounds[0],a=past.shareAdjustments[0];
 catchup(c,past.id,a.id,true);assert.throws(()=>payout(c,r.id),/catch-up/);
 topup(c,past.id,a.id);payout(c,r.id);
 assert.deepEqual(r.draw,saved);assert.equal(r.winner,winner);assert.equal(r.paidAmount,25000);
});
test('multiple late joins balance every member over the extended session',()=>{
 const c=make({bukkiFirst:false});
 function settleMonth(){const r=currentRound(c);draw(c,r.id);c.members.filter(m=>m.entries).forEach(m=>payment(c,r.id,m.id,true));payout(c,r.id);}
 settleMonth();settleMonth();
 addMember(c,{name:'First late member',entries:2});addMember(c,{name:'Second late member',entries:1});
 assert.deepEqual(adjustmentTotals(c),{contributionsDue:30000,payoutsDue:30000,pending:4});
 assert.throws(()=>draw(c,currentRound(c).id),/catch-up/);
 for(const r of c.rounds)for(const a of r.shareAdjustments||[]){catchup(c,r.id,a.id,true);topup(c,r.id,a.id);}
 while(currentRound(c))settleMonth();
 assert.equal(c.rounds.length,7);assert.equal(new Set(c.rounds.map(r=>r.winner)).size,7);
 for(const r of c.rounds){assert.equal(collected(c,r),monthlyPot(c));assert.equal(paidOut(c,r),monthlyPot(c));}
 for(const member of c.members){
  const contributions=c.rounds.reduce((sum,r)=>sum+(memberPaid(r,member.id)?member.entries*c.amount:0),0);
  const received=c.rounds.filter(r=>c.entries.find(e=>e.id===r.winner).memberId===member.id).reduce((sum,r)=>sum+paidOut(c,r),0);
  assert.equal(received,contributions,member.name+' should receive exactly their full-session contributions');
 }
});
test('new entries can extend a finished committee without erasing settled payouts',()=>{
 const c=make({bukkiFirst:false});
 while(currentRound(c)){const r=currentRound(c);draw(c,r.id);c.members.forEach(m=>payment(c,r.id,m.id,true));payout(c,r.id);}
 const past=c.rounds.map(r=>({id:r.id,paidAt:r.paidAt,winner:r.winner}));
 addMember(c,{name:'New entry',entries:1});
 assert.equal(c.rounds.length,5);assert.equal(currentRound(c),c.rounds[4]);
 assert.deepEqual(c.rounds.slice(0,4).map(r=>({id:r.id,paidAt:r.paidAt,winner:r.winner})),past);
 assert.equal(adjustmentTotals(c).pending,4);
});
test('invalid or excessive late allocations leave the committee unchanged',()=>{
 const c=historical([{memberIndex:0,settled:true}]),m=addMember(c,{name:'Viewer',entries:0}),before=structuredClone(c);
 for(const n of [0,-1,1.5,13,NaN]){assert.throws(()=>assignShares(c,m.id,n));assert.deepEqual(c,before);}
 for(let i=0;i<9;i++)addMember(c,{name:'Member '+i,entries:12});
 addMember(c,{name:'Fill remaining',entries:8});assert.equal(c.entries.length,120);assert.equal(sharesLocked(c),true);
 const full=structuredClone(c);assert.throws(()=>assignShares(c,m.id,1),/120/);assert.deepEqual(c,full);
});
