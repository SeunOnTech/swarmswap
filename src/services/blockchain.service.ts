import { JsonRpcProvider, Wallet } from 'ethers';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  type Address, 
  type Hex 
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia as viemSepolia } from 'viem/chains';
import { 
  createBundlerClient, 
  createPaymasterClient
} from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { getSmartAccountsEnvironment, Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit';
import { CONFIG } from '../config/constants';

// Ordered list of Sepolia RPC URLs — primary first, then backups.
// Add SEPOLIA_RPC_URL_2, SEPOLIA_RPC_URL_3 to .env for rotation.
// Free public fallback: https://rpc.sepolia.org (no key required)
function buildSepoliaRpcList(): string[] {
  const candidates = [
    process.env.SEPOLIA_RPC_URL,
    process.env.SEPOLIA_RPC_URL_2,
    process.env.SEPOLIA_RPC_URL_3,
    'https://rpc.sepolia.org',      // always-available public fallback
  ];
  return candidates.filter((u): u is string => !!u);
}

export class BlockchainService {
  public sepoliaProvider: JsonRpcProvider;
  public ogProvider: JsonRpcProvider;
  public agentWallet: Wallet;
  public agentOgWallet: Wallet;

  private sepoliaRpcList: string[];
  private sepoliaRpcIndex = 0;

  constructor() {
    this.sepoliaRpcList = buildSepoliaRpcList();
    this.sepoliaProvider = this.makeSepoliaProvider(this.sepoliaRpcList[0]);

    this.ogProvider = new JsonRpcProvider(
      process.env.OG_RPC_URL!,
      CONFIG.OG_GALILEO.chainId,
      { staticNetwork: true }
    );

    const agentKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentKey) throw new Error('AGENT_PRIVATE_KEY is missing from environment variables.');

    this.agentWallet = new Wallet(agentKey, this.sepoliaProvider);
    this.agentOgWallet = new Wallet(agentKey, this.ogProvider);
  }

  private makeSepoliaProvider(url: string): JsonRpcProvider {
    return new JsonRpcProvider(url, CONFIG.SEPOLIA.chainId, { staticNetwork: true });
  }

  /** Rotate to next Sepolia RPC and reconnect wallet. Call when current RPC rate-limits. */
  rotateSepoliaRpc(): void {
    this.sepoliaRpcIndex = (this.sepoliaRpcIndex + 1) % this.sepoliaRpcList.length;
    const nextUrl = this.sepoliaRpcList[this.sepoliaRpcIndex];
    process.stdout.write(`[RPC] Rotating Sepolia RPC to: ${nextUrl}\n`);
    this.sepoliaProvider = this.makeSepoliaProvider(nextUrl);
    this.agentWallet = new Wallet(process.env.AGENT_PRIVATE_KEY!, this.sepoliaProvider);
  }

  /** Execute an RPC call, auto-rotating on batch-limit errors. */
  async callWithRetry<T>(fn: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = this.sepoliaRpcList.length;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await fn(this.sepoliaProvider);
      } catch (err: any) {
        const isBatchLimit = err?.info?.responseBody?.includes('more than') ||
                             err?.message?.includes('more than') ||
                             err?.message?.includes('batch') ||
                             err?.info?.responseStatus?.includes('500');
        if (isBatchLimit && this.sepoliaRpcList.length > 1) {
          this.rotateSepoliaRpc();
          lastErr = err;
          await new Promise(r => setTimeout(r, 200)); // brief pause before retry
        } else {
          throw err;
        }
      }
    }
    throw lastErr;
  }

  getPimlicoRpcUrl(): string {
    return `https://api.pimlico.io/v2/${CONFIG.SEPOLIA.chainId}/rpc?apikey=${process.env.PIMLICO_API_KEY!}`;
  }

  async getSmartAccountContext(userPrivateKey: Hex) {
    const publicClient = createPublicClient({
      chain: viemSepolia,
      transport: http(process.env.SEPOLIA_RPC_URL!)
    });
    const userAccount = privateKeyToAccount(userPrivateKey);
    const userWalletClient = createWalletClient({
      account: userAccount,
      chain: viemSepolia,
      transport: http(process.env.SEPOLIA_RPC_URL!)
    });
    
    const environment = getSmartAccountsEnvironment(CONFIG.SEPOLIA.chainId, CONFIG.SMART_ACCOUNTS_VERSION);
    const userSmartAccount = await toMetaMaskSmartAccount({
      client: publicClient as any,
      implementation: Implementation.Hybrid,
      deployParams: [userAccount.address, [], [], []],
      deploySalt: CONFIG.HYBRID_DEPLOY_SALT,
      signer: { walletClient: userWalletClient as any },
      environment
    });

    const pimlicoRpcUrl = this.getPimlicoRpcUrl();
    const paymasterClient = createPaymasterClient({
      transport: http(pimlicoRpcUrl) as any
    });
    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoRpcUrl) as any
    });
    
    const bundlerClient = createBundlerClient({
      client: publicClient as any,
      chain: viemSepolia,
      transport: http(pimlicoRpcUrl) as any,
      paymaster: paymasterClient as any,
      userOperation: {
        estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast
      }
    });

    return {
      publicClient,
      bundlerClient,
      userAccount,
      userWalletClient,
      userSmartAccount,
      environment,
      pimlicoRpcUrl
    };
  }
}
