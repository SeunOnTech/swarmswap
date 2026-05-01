import { SwarmStorage } from '../storage/client';

export async function checkConsensus(
  proposalHashes: string[],
  privateKey: string
) {
  const storage = new SwarmStorage(privateKey);
  const proposals = await Promise.all(
    proposalHashes.map(hash => storage.downloadJson(hash))
  );

  const votes: Record<string, number> = {};
  proposals.forEach(p => {
    votes[p.action] = (votes[p.action] || 0) + 1;
  });

  const winningAction = Object.keys(votes).find(action => votes[action] >= 2);
  
  if (winningAction) {
    console.log(`Consensus reached: ${winningAction}`);
    return winningAction;
  }

  console.log('No consensus reached yet.');
  return null;
}
