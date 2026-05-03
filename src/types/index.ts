import { Address, Hex } from 'viem';

export type RuntimeState = {
  token0: string;
  token1: string;
  amountIn: string;
  current_asset: 'ETH' | 'WETH' | 'USDC';
  current_tick: number;
  last_tick: number;
  initial_tick?: number;
  last_consensus_hash: string;
  updated_at: number;
};

export type RuntimeConfig = {
  version: 'erc4337-hybrid-v1';
  pool: string;
  feeTier: number;
  slippage_bps: number;
  execution_chain_id: number;
  coordination_chain_id: number;
  owner_eoa: Address;
  agent_delegate: Address;
  swarmId: string;
  smart_account: {
    implementation: 'Hybrid';
    address: Address;
    delegation_manager: Address;
    pimlico_rpc_url: string;
    environment_version: string;
    deployment_user_op_hash: string;
    deployment_tx_hash: string;
    approval_user_op_hash: string;
    approval_tx_hash: string;
  };
  delegation: Record<string, any>;
  created_at: number;
};

export type AgentProposal = {
  role: string;
  action: string;
  confidence: number;
  ts: number;
  data?: any;
  attestation?: string | null;
  reasoning?: string;
};
