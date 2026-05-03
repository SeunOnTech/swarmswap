const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type SwarmResult = {
  swarmId: string;
  tokenId: string;
  configURI: string;
  stateURI: string;
  mintTx: string;
  smartAccount: string;
};

export type SwarmInfo = {
  swarmId: string;
  tokenId: string;
  status: string;
};

export async function getAgentAddress(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/agent`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.agentAddress;
}

export async function createSwarm(
  userAddress?: string,
  amount = '0.003',
  smartAccountAddress?: string,
  delegation?: any,
  environmentVersion?: string,
  pimlicoRpcUrl?: string
): Promise<SwarmResult> {
  const res = await fetch(`${API_BASE}/api/swarms/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAddress, amount, smartAccountAddress, delegation, environmentVersion, pimlicoRpcUrl }, (_, v) => typeof v === 'bigint' ? v.toString() : v)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getSwarms(): Promise<{ swarms: SwarmInfo[] }> {
  const res = await fetch(`${API_BASE}/api/swarms`);
  if (!res.ok) return { swarms: [] };
  return res.json();
}

/** Ask the backend to stop the autonomous loop for this swarm (NFT and delegation unchanged). */
export async function stopSwarm(swarmId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/swarms/${encodeURIComponent(swarmId)}/stop`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function subscribeToSwarm(swarmId: string, onEvent: (event: any) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/swarms/${swarmId}/stream`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  es.onerror = () => {}; // reconnects automatically
  return () => es.close();
}
