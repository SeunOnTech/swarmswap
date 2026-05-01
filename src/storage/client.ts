import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';

const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';

export class SwarmStorage {
  private indexer: Indexer;
  private signer: ethers.Wallet;

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.indexer = new Indexer(INDEXER_RPC);
  }

  async uploadJson(data: Record<string, any>): Promise<string> {
    const content = JSON.stringify(data, null, 2);
    const memData = new MemData(new TextEncoder().encode(content));
    
    const [tree, treeErr] = await memData.merkleTree();
    if (treeErr) throw new Error(`Merkle error: ${treeErr}`);
    
    const [tx, uploadErr] = await this.indexer.upload(memData, RPC_URL, this.signer);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr}`);
    
    return 'rootHash' in tx ? (tx as any).rootHash : (tx as any).rootHashes[0];
  }

  async downloadJson(rootHash: string): Promise<Record<string, any>> {
    const [blob, dlErr] = await this.indexer.downloadToBlob(rootHash, { proof: true });
    if (dlErr) throw new Error(`Download failed: ${dlErr}`);
    
    return JSON.parse(new TextDecoder().decode(blob));
  }
}
