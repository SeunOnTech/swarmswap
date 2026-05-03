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

export class BlockchainService {
  public sepoliaProvider: JsonRpcProvider;
  public ogProvider: JsonRpcProvider;
  public agentWallet: Wallet;
  public agentOgWallet: Wallet;

  constructor() {
    this.sepoliaProvider = new JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL!, 
      CONFIG.SEPOLIA.chainId, 
      { staticNetwork: true }
    );
    this.ogProvider = new JsonRpcProvider(
      process.env.OG_RPC_URL!, 
      CONFIG.OG_GALILEO.chainId, 
      { staticNetwork: true }
    );
    
    const agentKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentKey) {
      throw new Error("AGENT_PRIVATE_KEY is missing from environment variables.");
    }
    
    this.agentWallet = new Wallet(agentKey, this.sepoliaProvider);
    this.agentOgWallet = new Wallet(agentKey, this.ogProvider);
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
