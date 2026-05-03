import * as fs from 'fs';
import * as path from 'path';

type EventCallback = (event: Record<string, any>) => void;

export class LoggerService {
  private logPath: string;
  private subscribers: EventCallback[] = [];

  constructor(filename: string = 'swarmswap-runtime.log') {
    this.logPath = path.join(process.cwd(), filename);
    fs.writeFileSync(this.logPath, `--- SwarmSwap Runtime Log Started: ${new Date().toISOString()} ---\n`);
  }

  public emit(type: string, data: Record<string, any>) {
    const event = { type, data, ts: new Date().toISOString() };
    const ndjson = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.logPath, ndjson);
    this.subscribers.forEach(cb => { try { cb(event); } catch {} });
  }

  public log(tag: string, message: string, color?: string) {
    this.emit('LOG', { tag, message, color });
  }

  public subscribe(callback: EventCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callback);
    };
  }
}
