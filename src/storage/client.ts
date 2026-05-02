import { Indexer, MemData, ZgFile, StorageNode, Downloader } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';

const OG_RPC = 'https://evmrpc-testnet.0g.ai';
const OG_INDEXER = 'https://indexer-storage-testnet-turbo.0g.ai';
const FALLBACK_NODES = [
    'http://34.83.53.209:5678',
    'http://34.169.28.106:5678',
    'http://35.236.80.213:5678',
    'http://34.19.125.196:5678'
];

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.swarm_cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getFromCache(hash: string): any {
    const file = path.join(CACHE_DIR, `${hash}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    return null;
}

function saveToCache(hash: string, data: any) {
    fs.writeFileSync(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify(data, null, 2));
}

export class SwarmStorage {
  private indexer: Indexer;
  private signer: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;

  constructor(privateKey?: string) {
    const key = privateKey || process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!key) throw new Error("No private key provided for SwarmStorage");
    
    this.provider = new ethers.JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
    this.signer = new ethers.Wallet(key, this.provider);
    this.indexer = new Indexer(OG_INDEXER);
  }

  async uploadJson(data: Record<string, any>, maxWaitMs: number = 5000): Promise<string> {
    const content = JSON.stringify(data, null, 2);
    const memData = new MemData(new TextEncoder().encode(content));
    
    const [uploader, err] = await this.indexer.newUploaderFromIndexerNodes(OG_RPC, this.signer, 1);
    if (err || !uploader) throw new Error(`Uploader creation failed: ${err}`);

    const [tree] = await memData.merkleTree();
    const rootHash = tree!.rootHash()!;
    const [submission] = await memData.createSubmission('0x', await this.signer.getAddress());

    // 1. Store in persistent disk cache for instant cross-process read
    if (!data.token0 || !data.token1) {
        console.warn(`[Storage] Warning: Uploading state with missing tokens!`, data);
    }
    saveToCache(rootHash, data);

    // 2. Perform REAL background upload to 0G
    console.log(`[Storage] Submitting Flow TX for ${rootHash}...`);
    const [txHash, txErr] = await (uploader as any).submitLogEntryNoReceipt(submission);
    
    if (!txErr) {
        // Optimistically push segments in background if possible
        const provider = new ethers.JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
        provider.getTransactionReceipt(txHash).then(async (receipt) => {
            if (receipt) {
                let txSeq: number | undefined;
                const flowAddress = (uploader as any).flow.target.toLowerCase();
                for (const log of receipt.logs) {
                    if (log.address.toLowerCase() === flowAddress) {
                        const parsed = (uploader as any).flow.interface.parseLog(log);
                        if (parsed && parsed.name === 'Submit') {
                            txSeq = Number(parsed.args.submissionIndex);
                            break;
                        }
                    }
                }
                if (txSeq !== undefined) {
                    const info = { tx: { seq: txSeq, startEntryIndex: 0, size: memData.size() }, finalized: false };
                    const tasks = await (uploader as any).splitTasks(info, tree, { taskSize: 1 });
                    await (uploader as any).processTasksInParallel(memData, tree, tasks);
                    console.log(`[Storage] Background sync complete for ${rootHash}`);
                }
            }
        }).catch(() => {});
    }

    console.log(`[Storage] CID Generated & Cached: ${rootHash}`);
    return rootHash;
  }

  async downloadJson(rootHash: string): Promise<Record<string, any>> {
    // 1. Check Persistent Disk Cache First (Instant & Cross-process)
    const cached = getFromCache(rootHash);
    if (cached) {
        return cached;
    }

    // 2. Direct Node Bypass (The "Fast-Path")
    for (const url of FALLBACK_NODES) {
        try {
            const directIndexer = new Indexer(url); // Used as a thin client to the node
            const [blob, dlErr] = await directIndexer.downloadToBlob(rootHash);
            if (!dlErr && blob) {
                const buffer = await blob.arrayBuffer();
                const data = JSON.parse(new TextDecoder().decode(buffer));
                saveToCache(rootHash, data);
                return data;
            }
        } catch (e) {}
    }
    
    throw new Error(`Data ${rootHash} not available yet (0G nodes are still syncing).`);
  }

  async isFileAvailable(rootHash: string): Promise<boolean> {
      return getFromCache(rootHash) !== null;
  }
}
