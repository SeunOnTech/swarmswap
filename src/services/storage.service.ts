import { Indexer, ZgFile } from '@0gfoundation/0g-storage-ts-sdk';
import { Wallet } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config/constants';

export class StorageService {
  private indexer: Indexer;
  private signer: Wallet;
  private rpcUrl: string;
  public bytesUploaded = 0;

  constructor(agentWallet: Wallet) {
    this.indexer = new Indexer(CONFIG.OG_INDEXER_URL);
    this.signer = agentWallet;
    this.rpcUrl = process.env.OG_RPC_URL!;
    
    if (!this.rpcUrl) {
      throw new Error('OG_RPC_URL environment variable is not set');
    }
  }

  async uploadJson(logicalPath: string, data: Record<string, any>): Promise<string> {
    const tmpPath = path.join('/tmp', `swarmswap_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    const content = JSON.stringify(data, null, 2);
    this.bytesUploaded += content.length;
    
    // Ensure tmp dir exists (just in case)
    const tmpDir = path.dirname(tmpPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    fs.writeFileSync(tmpPath, content);
    try {
      const zgFile = await ZgFile.fromFilePath(tmpPath);
      const [result, err] = await this.indexer.upload(zgFile, this.rpcUrl, this.signer);
      await zgFile.close();
      
      if (err) throw err;
      
      if ('rootHash' in result) return result.rootHash;
      if ('rootHashes' in result && result.rootHashes.length > 0) return result.rootHashes[0];
      
      return logicalPath;
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  async downloadJson(rootHash: string): Promise<Record<string, any>> {
    const tmpPath = path.join('/tmp', `swarmswap_dl_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    try {
      const err = await this.indexer.download(rootHash, tmpPath);
      if (err) throw err;
      
      const content = fs.readFileSync(tmpPath, 'utf-8');
      return JSON.parse(content);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }
}
