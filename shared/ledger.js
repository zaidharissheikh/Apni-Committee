export const monthlyPot = committee => committee.entries.length * committee.amount;
export function memberPaid(round, memberId) {
  const adjustment = (round.shareAdjustments || []).find(a => a.memberId === memberId);
  return adjustment ? Boolean(adjustment.collectedAt) : Boolean(round.payments[memberId]?.paid);
}
export function collected(committee, round) {
  return committee.members.reduce((sum, member) => sum + (memberPaid(round, member.id) ? member.entries * committee.amount : 0), 0);
}
export function adjustmentTotals(committee) {
  return committee.rounds.reduce((total, round) => {
    for (const adjustment of round.shareAdjustments || []) {
      if (!adjustment.collectedAt) total.contributionsDue += adjustment.amount;
      if (!adjustment.paidAt) { total.payoutsDue += adjustment.amount; total.pending += 1; }
    }
    return total;
  }, { contributionsDue: 0, payoutsDue: 0, pending: 0 });
}
export function paidOut(committee, round) {
  if (!round.paidAt) return 0;
  return (round.paidAmount ?? monthlyPot(committee)) + (round.shareAdjustments || []).reduce((sum, a) => sum + (a.paidAt ? a.amount : 0), 0);
}
export function topUpsDue(round) {
  return (round.shareAdjustments || []).reduce((sum, a) => sum + (a.paidAt ? 0 : a.amount), 0);
}
