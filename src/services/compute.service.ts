import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { Wallet } from 'ethers';
import { CONFIG } from '../config/constants';
import { AgentProposal } from '../types';

export class ComputeService {
  private broker: any = null;
  private agentOgWallet: Wallet;

  constructor(agentOgWallet: Wallet) {
    this.agentOgWallet = agentOgWallet;
  }

  async init() {
    try {
      this.broker = await createZGComputeNetworkBroker(this.agentOgWallet as any);
      return true;
    } catch (err) {
      return false;
    }
  }

  async runComputeAgent(
    currentTick: number,
    lastTick: number,
    currentAsset: string
  ): Promise<AgentProposal> {
    const fallback: AgentProposal = {
      role: 'compute',
      action: 'HOLD',
      confidence: 0.5,
      ts: Math.floor(Date.now() / 1000),
      attestation: null,
      reasoning: '0G Compute unavailable — defaulting to HOLD'
    };

    if (!this.broker) return fallback;

    try {
      const { endpoint, model } = await this.broker.inference.getServiceMetadata(CONFIG.OG_COMPUTE_PROVIDER);
      const headers = await this.broker.inference.getRequestHeaders(CONFIG.OG_COMPUTE_PROVIDER);
      const tickDelta = Math.abs(currentTick - lastTick);

      const prompt = `You are a DeFi LP risk analyst. Analyze this Uniswap V3 position state:
- Current ETH/USDC tick: ${currentTick}
- Previous tick: ${lastTick}
- Tick delta: ${tickDelta} (${(tickDelta * 0.01).toFixed(2)}% price change)
- Current position asset: ${currentAsset}
- Rebalance threshold: 1 tick (0.01%)

Should the agent rebalance the LP position now? Consider impermanent loss risk and fee capture.
Respond ONLY with valid JSON: {"shouldRebalance": boolean, "confidence": number, "reasoning": string}`;

      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!res.ok) return fallback;
      const data: any = await res.json();
      const analysis = JSON.parse(data.choices[0].message.content);

      let attestation: string | null = null;
      const chatId = res.headers.get('ZG-Res-Key') || data.id;
      if (chatId) {
        const isValid = await this.broker.inference.processResponse(CONFIG.OG_COMPUTE_PROVIDER, chatId);
        attestation = isValid ? chatId : null;
      }

      return {
        role: 'compute',
        action: analysis.shouldRebalance ? 'REBALANCE' : 'HOLD',
        confidence: Math.min(0.99, Math.max(0.01, Number(analysis.confidence) || 0.7)),
        ts: Math.floor(Date.now() / 1000),
        attestation,
        reasoning: String(analysis.reasoning || '').slice(0, 120)
      };
    } catch {
      return fallback;
    }
  }
}
