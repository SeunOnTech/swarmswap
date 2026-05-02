import { SwarmStorage } from '../storage/client';

export async function checkConsensus(proposals: any[], privateKey: string): Promise<string | null> {
  if (proposals.length < 2) return null;
  
  const actions = proposals.map(p => typeof p === 'string' ? p : p.action);

  const votes: Record<string, number> = {};
  actions.forEach(action => {
    votes[action] = (votes[action] || 0) + 1;
  });

  const winningAction = Object.keys(votes).find(action => votes[action] >= 2);
  
  if (winningAction) {
    console.log(`Consensus reached: ${winningAction}`);
    return winningAction;
  }

  console.log('No consensus reached yet.');
  return null;
}
