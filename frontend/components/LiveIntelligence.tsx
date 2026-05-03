"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { stopSwarm, subscribeToSwarm } from "@/lib/api";
import { AssetLogo } from "@/components/AssetLogo";
import { BRAND_LOGO_URLS, getTokenLogoUrl } from "@/lib/assetLogos";

// ─── types ─────────────────────────────────────────────────────────────────────
interface CanvasNode { x:number; y:number; vx:number; vy:number; r:number; pulse:number; }
type TagType = "system"|"analyzer"|"risk"|"memory"|"executor"|"sentinel"|"compute";
type ProofType = "anchor"|"verify"|"fork"|"store";

interface LogEntry  { tag: TagType; msg: React.ReactNode; }
interface ProofEvent { type: ProofType; typeLabel: string; hash: string; desc: string; block: number; }

// ─── helpers ───────────────────────────────────────────────────────────────────
function padTime(d: Date) {
  return [d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,"0")).join(":");
}

const CopyIcon = ({size=14, color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = ({size=14, color="#4ade80"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

/** Soft shield — assurance / attestation */
const ShieldSoftIcon = ({ size = 18, stroke = "#94a3b8", fill = "rgba(148,163,184,0.12)" }: { size?: number; stroke?: string; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 21.5c4.2-1.8 7-5.6 7-10.1V6.2L12 3.5 5 6.2v5.2c0 4.5 2.8 8.3 7 10.1Z"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

/** Verified step — check in circle */
const VerifyBadgeIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9.5" fill="rgba(16,185,129,0.15)" stroke="#34d399" strokeWidth="1.25" />
    <path d="M8 12.2l2.4 2.4L16 9" stroke="#6ee7b7" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StoreStepIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="5" y="4" width="14" height="16" rx="2" fill="rgba(96,165,250,0.1)" stroke="#7dd3fc" strokeWidth="1.2" />
    <path d="M8 9h8M8 13h5" stroke="#93c5fd" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ForkStepIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="8" cy="6" r="2.2" fill="rgba(251,191,36,0.2)" stroke="#fcd34d" strokeWidth="1.1" />
    <circle cx="8" cy="18" r="2.2" fill="rgba(251,191,36,0.2)" stroke="#fcd34d" strokeWidth="1.1" />
    <circle cx="16" cy="12" r="2.2" fill="rgba(251,191,36,0.2)" stroke="#fcd34d" strokeWidth="1.1" />
    <path d="M8 8.2v2.8q0 1.2 1 1.8l6 3.4q1 .6 1 1.8v1" stroke="#fcd34d" strokeWidth="1.1" fill="none" strokeLinecap="round" />
  </svg>
);

// ─── sub-components ────────────────────────────────────────────────────────────
const LogoMark: React.FC = () => (
  <div style={s.logoMark} aria-hidden>
    <svg width="14" height="14" viewBox="0 0 38 38" fill="none">
      <path d="M25 7H13C9.686 7 7 9.686 7 13v1c0 2.21 1.79 4 4 4h10c3.314 0 6 2.686 6 6v1c0 3.314-2.686 6-6 6H9" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 4l-4 3 4 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 28l4 3-4 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const TerminalLine: React.FC<{ entry: LogEntry & { time: string }; visible: boolean }> = ({ entry, visible }) => {
  const tagStyle: Record<TagType, React.CSSProperties> = {
    system:   { background:"rgba(255,255,255,0.05)", color:"#7a7990" },
    analyzer: { background:"rgba(96,165,250,0.12)",  color:"#60a5fa" },
    risk:     { background:"rgba(248,113,113,0.1)",   color:"#f87171" },
    memory:   { background:"rgba(124,58,237,0.12)",  color:"#a78bfa" },
    executor: { background:"rgba(74,222,128,0.1)",   color:"#4ade80" },
    sentinel: { background:"rgba(251,191,36,0.1)",   color:"#fbbf24" },
    compute:  { background:"rgba(34,211,238,0.12)",  color:"#22d3ee" },
  };
  return (
    <div style={{ ...s.logLine, opacity: visible ? 1 : 0, transition: "opacity 0.2s" }}>
      <span style={s.logTime}>{entry.time}</span>
      <span style={{ ...s.logTag, ...tagStyle[entry.tag] }}>{entry.tag.toUpperCase()}</span>
      <span style={s.logMsg}>{entry.msg}</span>
    </div>
  );
};

const ProofTimelineStep: React.FC<{ ev: ProofEvent; time: string; isLast: boolean }> = ({ ev, time, isLast }) => {
  const labelMap: Record<string, string> = {
    DECISION_ANCHOR: "Consensus secured",
    HEARTBEAT: "Network pulse",
    VERIFY: "Execution proof confirmed",
    STORE: "Storage attestation",
    LINEAGE_UPDATE: "Lineage updated",
    MEMORY_ANCHOR: "Memory anchored",
    PROOF_VERIFY: "Proof verified",
  };
  const label = labelMap[ev.typeLabel] || ev.typeLabel.replace(/_/g, " ").toLowerCase();

  const node =
    ev.type === "verify" ? (
      <VerifyBadgeIcon size={20} />
    ) : ev.type === "store" ? (
      <StoreStepIcon size={20} />
    ) : ev.type === "fork" ? (
      <ForkStepIcon size={20} />
    ) : (
      <ShieldSoftIcon size={20} stroke="#a5b4fc" fill="rgba(129,140,248,0.14)" />
    );

  const accent =
    ev.type === "verify"
      ? "#34d399"
      : ev.type === "store"
        ? "#7dd3fc"
        : ev.type === "fork"
          ? "#fcd34d"
          : "#a5b4fc";

  return (
    <div style={s.timelineRow}>
      <div style={s.timelineRail} aria-hidden>
        <div style={s.timelineNodeWrap}>{node}</div>
        {!isLast ? <div style={{ ...s.timelineConnector, background: `linear-gradient(180deg, ${accent}55 0%, rgba(255,255,255,0.06) 100%)` }} /> : null}
      </div>
      <div style={s.timelineCard}>
        <div style={s.timelineCardTop}>
          <h3 style={s.timelineTitle}>{label}</h3>
          <time style={s.timelineTime} dateTime={time}>
            {time}
          </time>
        </div>
        {ev.desc ? <p style={s.timelineDesc}>{ev.desc}</p> : null}
        <div style={s.timelineFooter}>
          <span style={s.timelineRefLabel}>Reference</span>
          <span style={s.timelineRefValue}>{ev.hash}</span>
          <span style={{ ...s.timelineVerifiedPill, borderColor: `${accent}44`, color: accent }}>
            <CheckIcon size={11} color={accent} />
            Attested
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── strategy chart ────────────────────────────────────────────────────────────
const StrategyChart: React.FC<{ ticks: number[], rebalances: Set<number>, boundsHistory: {lower:number, upper:number}[] }> = ({ ticks, rebalances, boundsHistory }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap || ticks.length === 0) return;
    const dpr  = window.devicePixelRatio || 1;
    const W    = wrap.clientWidth, H = 140;
    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const cx = canvas.getContext("2d")!;
    cx.scale(dpr, dpr);

    const N = Math.max(ticks.length, 20); // show at least a window
    const pad = { t:12, r:16, b:24, l:44 };
    const iW = W - pad.l - pad.r, iH = H - pad.t - pad.b;
    
    // Find min/max tick to scale Y-axis
    let minV = Number.MAX_VALUE, maxV = Number.MIN_VALUE;
    ticks.forEach((v, i) => {
        const b = boundsHistory[i] || boundsHistory[boundsHistory.length-1];
        minV = Math.min(minV, v, b.lower);
        maxV = Math.max(maxV, v, b.upper);
    });
    // Add padding to min/max
    const range = maxV - minV;
    minV -= range * 0.2;
    maxV += range * 0.2;
    if (minV === maxV) { minV -= 100; maxV += 100; }

    const toX = (i:number) => pad.l + (i/(N-1))*iW;
    const toY = (v:number) => pad.t + (1-(v-minV)/(maxV-minV))*iH;

    // grid
    cx.strokeStyle="rgba(255,255,255,0.04)"; cx.lineWidth=1;
    for (let i=0;i<=4;i++) {
      const y=pad.t+(i/4)*iH;
      cx.beginPath(); cx.moveTo(pad.l,y); cx.lineTo(W-pad.r,y); cx.stroke();
      cx.fillStyle="rgba(255,255,255,0.2)"; cx.font="9px 'Space Mono',monospace";
      cx.textAlign="right"; cx.fillText(Math.floor(maxV-i/4*(maxV-minV)).toString(), pad.l-6, y+3);
    }

    // Draw Shaded LP Channel
    cx.fillStyle = "rgba(167,139,250,0.08)";
    cx.beginPath();
    cx.moveTo(toX(0), toY(boundsHistory[0].upper));
    for (let i = 1; i < ticks.length; i++) {
        cx.lineTo(toX(i), toY(boundsHistory[i].upper));
    }
    for (let i = ticks.length - 1; i >= 0; i--) {
        cx.lineTo(toX(i), toY(boundsHistory[i].lower));
    }
    cx.closePath();
    cx.fill();

    // Draw boundaries
    cx.strokeStyle = "rgba(167,139,250,0.3)";
    cx.setLineDash([4,4]);
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(toX(0), toY(boundsHistory[0].upper));
    for(let i=1;i<ticks.length;i++) cx.lineTo(toX(i), toY(boundsHistory[i].upper));
    cx.stroke();
    cx.beginPath();
    cx.moveTo(toX(0), toY(boundsHistory[0].lower));
    for(let i=1;i<ticks.length;i++) cx.lineTo(toX(i), toY(boundsHistory[i].lower));
    cx.stroke();
    cx.setLineDash([]);

    // Price line
    cx.beginPath(); cx.moveTo(toX(0),toY(ticks[0]));
    for(let i=1;i<ticks.length;i++){const x0=toX(i-1),y0=toY(ticks[i-1]),x1=toX(i),y1=toY(ticks[i]),cpX=(x0+x1)/2; cx.bezierCurveTo(cpX,y0,cpX,y1,x1,y1);}
    cx.strokeStyle="#4ade80"; cx.lineWidth=2; cx.shadowColor="rgba(74,222,128,0.4)"; cx.shadowBlur=6; cx.stroke(); cx.shadowBlur=0;

    // dots (Rebalances)
    rebalances.forEach(i=>{
        if (i < ticks.length) {
            cx.beginPath();cx.arc(toX(i),toY(ticks[i]),4,0,Math.PI*2);
            cx.fillStyle="#0b0b0e";cx.fill();
            cx.strokeStyle="#4ade80";cx.lineWidth=2;cx.stroke();
        }
    });

    // end dot
    const lx=toX(ticks.length-1),ly=toY(ticks[ticks.length-1]);
    const g2=cx.createRadialGradient(lx,ly,0,lx,ly,6); g2.addColorStop(0,"rgba(74,222,128,0.4)"); g2.addColorStop(1,"rgba(74,222,128,0)");
    cx.beginPath();cx.arc(lx,ly,6,0,Math.PI*2);cx.fillStyle=g2;cx.fill();
    cx.beginPath();cx.arc(lx,ly,2.5,0,Math.PI*2);cx.fillStyle="#fff";cx.fill();

    // x-axis
    cx.fillStyle="rgba(255,255,255,0.2)"; cx.textAlign="center";
    ["00:00","06:00","12:00","18:00","Now"].forEach((l,i)=>cx.fillText(l,pad.l+(i/4)*iW,H-4));
  }, [ticks, rebalances, boundsHistory]);

  useEffect(() => {
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, [paint]);

  return (
    <div ref={wrapRef} style={{ width:"100%" }}>
      <canvas ref={canvasRef} style={{ display:"block", width:"100%", height:140 }} />
    </div>
  );
};

export type LiveIntelligenceProps = { swarmId?: string };

// ─── main ──────────────────────────────────────────────────────────────────────
const LiveIntelligence: React.FC<LiveIntelligenceProps> = ({ swarmId }) => {
  const bgCanvasRef  = useRef<HTMLCanvasElement>(null);
  const bgRafRef     = useRef<number>(0);
  const termRef      = useRef<HTMLDivElement>(null);
  const proofRef     = useRef<HTMLDivElement>(null);

  const [logLines, setLogLines]   = useState<Array<LogEntry & { time:string; id:number }>>([]);
  const [proofItems, setProofItems] = useState<Array<ProofEvent & { time:string; id:number }>>([]);
  const [anchorCount, setAnchorCount] = useState(0);
  const [storageKB, setStorageKB]     = useState(0);
  const [latestBlock, setLatestBlock] = useState(0);
  
  // Chart & Balance State
  const [ticks, setTicks] = useState<number[]>([198850]);
  const [rebalances, setRebalances] = useState<Set<number>>(new Set());
  const [boundsHistory, setBoundsHistory] = useState<{lower:number, upper:number}[]>([{lower:198650, upper:199050}]);
  
  const [positionValue, setPositionValue] = useState("Loading...");
  const [wethBalance, setWethBalance] = useState("— ETH");
  const [usdcBalance, setUsdcBalance] = useState("— USDC");
  const [currentTickStr, setCurrentTickStr] = useState("198850");
  const [smartAccount, setSmartAccount] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (smartAccount) {
      navigator.clipboard.writeText(smartAccount);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [blinkOn, setBlinkOn]         = useState(true);
  const [tab, setTab]                 = useState<"reasoning"|"history"|"memory">("reasoning");
  const lineIdRef  = useRef(0);
  const proofIdRef = useRef(0);
  const [runStopped, setRunStopped] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopMsg, setStopMsg] = useState<string | null>(null);

  const handlePauseRun = async () => {
    if (!swarmId || runStopped || stopBusy) return;
    setStopBusy(true);
    setStopMsg(null);
    try {
      await stopSwarm(swarmId);
      setRunStopped(true);
    } catch (e: unknown) {
      setStopMsg(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setStopBusy(false);
    }
  };

  // bg canvas
  useEffect(() => {
    const canvas = bgCanvasRef.current!;
    const ctx    = canvas.getContext("2d")!;
    let W=0, H=0, nodes:CanvasNode[]=[];
    const resize = () => { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; };
    const init   = () => { resize(); nodes=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,r:Math.random()*1.1+.3,pulse:Math.random()*Math.PI*2})); };
    const draw   = () => {
      ctx.clearRect(0,0,W,H);
      nodes.forEach(n=>{n.x+=n.vx;n.y+=n.vy;n.pulse+=.013;if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;});
      for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
        const dx=nodes[i].x-nodes[j].x,dy=nodes[i].y-nodes[j].y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<110){ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.strokeStyle=`rgba(139,92,246,${(1-d/110)*.06})`;ctx.lineWidth=.5;ctx.stroke();}
      }
      nodes.forEach(n=>{const p=(Math.sin(n.pulse)+1)*.5;ctx.beginPath();ctx.arc(n.x,n.y,n.r+p*.7,0,Math.PI*2);ctx.fillStyle=`rgba(167,139,250,${.05+p*.09})`;ctx.fill();});
      bgRafRef.current=requestAnimationFrame(draw);
    };
    init(); draw(); window.addEventListener("resize",resize);
    return () => { cancelAnimationFrame(bgRafRef.current); window.removeEventListener("resize",resize); };
  }, []);

  // cursor blink
  useEffect(() => {
    const t = setInterval(() => setBlinkOn(b => !b), 500);
    return () => clearInterval(t);
  }, []);

  const addLog = useCallback((entry: LogEntry) => {
    setLogLines(prev => [...prev, { ...entry, time: padTime(new Date()), id: lineIdRef.current++ }]);
  }, []);

  const addProof = useCallback((ev: ProofEvent) => {
    setProofItems(prev => [{ ...ev, time: padTime(new Date()), id: proofIdRef.current++ }, ...prev]);
  }, []);

  // subscribe to real live events
  useEffect(() => {
    if (!swarmId) return;

    const unsub = subscribeToSwarm(swarmId, (event) => {
      const d = event.data || {};
      
      if (event.type === 'METRICS') {
        setAnchorCount(d.anchors_count || 0);
        setStorageKB(Number(d.storage_used_kb) || 0);
        setLatestBlock(d.latest_og_block || 0);
        // eth_balance = native ETH + WETH combined; weth_balance = ERC20 WETH only (legacy)
        const ethBal = d.eth_balance ?? d.weth_balance;
        if (ethBal !== undefined) {
          setWethBalance(`${Number(ethBal).toFixed(4)} ETH`);
          setUsdcBalance(`${Number(d.usdc_balance).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} USDC`);
          setPositionValue(`$${Number(d.position_value).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`);
        }
        if (d.smart_account_address) {
          setSmartAccount(d.smart_account_address);
        }
        return;
      }

      if (event.type === 'RECALL') {
        if (d.smart_account) {
            setSmartAccount(d.smart_account);
        }
        return;
      }

      if (event.type === 'CYCLE_COMPLETE') {
        if (d.next_cycle_in_ms) {
          addLog({ tag: "system", msg: `Cycle complete. Action: ${d.action}. Next run in ${Math.round(d.next_cycle_in_ms/1000)}s` });
        }
        return;
      }

      // Convert to Proof Event
      if (event.type === 'ANCHOR') {
        const pType = d.event_type === 'VERIFY' ? 'verify' : d.event_type?.includes('UPDATE') ? 'fork' : 'anchor';
        addProof({
          type: pType,
          typeLabel: d.event_type || 'ANCHOR',
          hash: d.hash || `0x...`,
          desc: d.description || '',
          block: 0,
        });
      }

      // Chart integration
      if (event.type === 'OBSERVE') {
          const t = Number(d.real_tick);
          if (!isNaN(t)) {
              setCurrentTickStr(t.toString());
              setTicks(prev => {
                  const nt = [...prev, t];
                  return nt.length > 100 ? nt.slice(nt.length - 100) : nt;
              });
              setBoundsHistory(prev => {
                  const nb = [...prev, prev[prev.length - 1] || {lower: t-200, upper: t+200}];
                  return nb.length > 100 ? nb.slice(nb.length - 100) : nb;
              });
          }
      }

      if (event.type === 'CONSENSUS' && d.action === 'REBALANCE') {
          setTicks(prev => {
              const currentIdx = prev.length - 1;
              setRebalances(r => {
                  const nr = new Set(r);
                  nr.add(currentIdx);
                  return nr;
              });
              setBoundsHistory(b => {
                  const nb = [...b];
                  if (nb.length > 0 && prev.length > 0) {
                      const t = prev[prev.length - 1];
                      nb[nb.length - 1] = { lower: t - 200, upper: t + 200 };
                  }
                  return nb;
              });
              return prev;
          });
      }

      // Convert to Log Entry
      let text = '';
      let tag = event.type === 'LOG' ? (d.tag?.toLowerCase() || 'system') : 'system';
      
      switch (event.type) {
        case 'LOG': text = d.message || ''; break;
        case 'OBSERVE': text = `ETH/USDC mainnet tick: ${d.real_tick}`; tag = 'analyzer'; break;
        case 'PROPOSE': text = `Proposing candidate action: ${d.compute?.action || 'HOLD'}`; tag = 'compute'; break;
        case 'CONSENSUS': text = `Consensus: ${d.action} | ${d.quorum} quorum`; tag = 'system'; break;
        case 'EXECUTED': text = `Swap confirmed: ${d.swap} · Tx: ${d.tx_hash?.slice(0, 10)}…`; tag = 'executor'; break;
        case 'ANCHORED': text = `State anchored to 0G Galileo · trades: ${d.total_trades}`; tag = 'memory'; break;
        case 'ERROR': text = `Error: ${d.message?.slice(0, 80)}`; tag = 'risk'; break;
        case 'LOOP_STOPPED': text = `Engine stopped · token ${d.token_id ?? '?'}`; tag = 'system'; break;
      }

      if (text) {
        addLog({ tag: tag as TagType, msg: text });
      }
    });

    return () => unsub();
  }, [swarmId, addLog, addProof]);

  // auto-scroll terminal
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logLines]);

  return (
    <>
      <style>{CSS}</style>
      <canvas ref={bgCanvasRef} style={s.bgCanvas} />
      <div style={s.glowTop} />

      <div style={s.shell}>

        <header className="live-topbar" style={s.topbar}>
          <div className="live-topbar-brand" style={s.topbarBrand}>
            <Link href="/" style={s.brandLink} aria-label="SwarmSwap home">
              <LogoMark />
              <span style={s.brandWordmark}>SwarmSwap</span>
            </Link>
          </div>

          <div className="live-topbar-center" style={s.topbarCenter}>
            <div style={s.identityBlock}>
              <div style={s.identityHeadline}>
                <span style={s.galileoChip} title="0G Galileo testnet">
                  <AssetLogo src={BRAND_LOGO_URLS.zeroGGalileo} alt="" size={14} />
                  <span style={s.galileoChipDot} aria-hidden />
                  0G Galileo
                </span>
                <h1 style={s.identityTitle}>
                  {swarmId ? (
                    <>
                      <span style={s.identityPrefix}>Swarm</span>{" "}
                      <span style={s.identityHash}>{swarmId}</span>
                    </>
                  ) : (
                    "Intelligence console"
                  )}
                </h1>
              </div>
              <div style={s.metaRow}>
                {smartAccount ? (
                  <>
                    <span style={s.metaLabel}>Smart account</span>
                    <code style={s.metaMono}>
                      {smartAccount.slice(0, 6)}…{smartAccount.slice(-4)}
                    </code>
                    <button
                      type="button"
                      className="live-copy-btn"
                      onClick={handleCopy}
                      style={s.copyBtn}
                      title="Copy full address"
                      aria-label="Copy smart account address"
                    >
                      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </button>
                    <span style={s.metaDot}>·</span>
                    <span style={s.metaPill}>Active liquidity engine</span>
                  </>
                ) : (
                  <span style={s.metaMuted}>
                    Open from the dashboard after creating a swarm — smart account appears on stream
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="live-topbar-actions" style={s.topbarActions}>
            <div style={{ ...s.liveBadge, ...(runStopped ? s.liveBadgeStopped : {}) }} aria-live="polite">
              <span style={{ ...s.liveDot, ...(runStopped ? { background: "#6b7280", boxShadow: "none", animation: "none" } : {}) }} />
              {runStopped ? "STOPPED" : "LIVE"}
            </div>
            <div style={s.ctaCluster}>
              <button
                type="button"
                style={{
                  ...s.tbBtn,
                  ...s.tbGhost,
                  ...(stopBusy ? { opacity: 0.65, cursor: "wait" as const } : {}),
                  ...(runStopped ? { opacity: 0.5 } : {}),
                }}
                disabled={!swarmId || runStopped || stopBusy}
                title={!swarmId ? "Open this page from the dashboard after creating a swarm" : undefined}
                onClick={() => void handlePauseRun()}
              >
                {stopBusy ? "Stopping…" : runStopped ? "Run stopped" : "Pause run"}
              </button>
              {stopMsg ? (
                <span style={s.stopMsg}>{stopMsg}</span>
              ) : null}
              <Link
                href="/app/dashboard"
                style={{ ...s.tbBtn, ...s.tbGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Back to Swarms
              </Link>
              <Link
                href="/app"
                style={{ ...s.tbBtn, ...s.tbPrimary, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                Create Swarm
              </Link>
            </div>
          </div>
        </header>

        {/* layout */}
        <div className="responsive-layout" style={s.layout}>

          {/* left col */}
          <div style={s.colMain}>

            {/* chart */}
            <div style={s.chartPanel}>
              <div style={s.panelHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={s.panelTitle}>Concentrated Liquidity Tick Bounds —</span>
                  <span style={{ ...s.panelTitle, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <AssetLogo src={getTokenLogoUrl("WETH")} alt="" size={14} />
                    <AssetLogo src={getTokenLogoUrl("USDC")} alt="" size={14} />
                    ETH/USDC
                  </span>
                </div>
                <div style={{...s.chartStats, flexWrap: "wrap", rowGap: 8}}>
                  {([
                    [positionValue, "#f5f4f9", "Position Value", null as string | null],
                    [wethBalance,   "#4ade80", "ETH Balance", "WETH"],
                    [usdcBalance,   "#60a5fa", "USDC Balance", "USDC"],
                    [currentTickStr,"#a78bfa", "Current Tick", null],
                  ] as [string,string,string,string|null][]).map(([v,c,l,tok]) => (
                    <div key={l} style={s.cstat}>
                      <span style={{...s.cstatVal, color:c}}>{v}</span>
                      <span style={{ ...s.cstatLbl, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {tok ? <AssetLogo src={getTokenLogoUrl(tok)} alt="" size={12} /> : null}
                        {l}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <StrategyChart ticks={ticks} boundsHistory={boundsHistory} rebalances={rebalances} />
              <div style={s.chartLegend}>
                {([["#4ade80","ETH/USDC Tick", true],["rgba(167,139,250,0.5)","LP Range Bounds", false],["#a78bfa","Active Zone", false],["#f5f4f9","Rebalance Trigger", false]] as [string,string,boolean][]).map(([c,l,showPair]) => (
                  <div key={l} style={s.legendItem}>
                    <div style={{...s.legendDot, background:c}} />
                    {showPair ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <AssetLogo src={getTokenLogoUrl("WETH")} alt="" size={11} />
                        <AssetLogo src={getTokenLogoUrl("USDC")} alt="" size={11} />
                        {l}
                      </span>
                    ) : (
                      l
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* terminal */}
            <div style={s.terminalPanel}>
              <div style={s.terminalHead}>
                <div style={s.terminalTabs}>
                  {(["reasoning","history","memory"] as const).map(t => (
                    <button key={t} style={{...s.tTab,...(tab===t?s.tTabActive:{})}} onClick={()=>setTab(t)}>
                      {t==="reasoning"?"Live Reasoning":t==="history"?"Run History":"Memory Trace"}
                    </button>
                  ))}
                </div>
                <div style={s.terminalStatus}><span style={s.tsDot}/> Streaming live from Engine</div>
              </div>
              <div ref={termRef} style={s.terminalBody}>
                {logLines.map(line => <TerminalLine key={line.id} entry={line} visible={true} />)}
                <div style={s.cursorLine}>
                  <span style={s.cursorTag}>_</span>
                  <span style={{...s.cursorBlink, opacity: blinkOn ? 0.7 : 0}} />
                </div>
              </div>
            </div>

          </div>

          {/* right col: verification timeline (0G) */}
          <div className="responsive-side" style={s.colSide}>
            <div style={s.proofPanel}>
              <div style={s.proofHead}>
                <div style={s.proofHeadText}>
                  <span style={s.proofTitle}>Verification timeline</span>
                  <span style={s.proofSubtitle}>0G network attestations</span>
                </div>
                <span style={s.proofCountPill}>
                  <CheckIcon size={12} color="#34d399" />
                  {anchorCount} verified
                </span>
              </div>
              <div ref={proofRef} style={s.proofStream}>
                {proofItems.length === 0 ? (
                  <p style={s.timelineEmpty}>Attestation steps from your swarm will appear here as the engine runs.</p>
                ) : (
                  proofItems.map((ev, i) => (
                    <ProofTimelineStep key={ev.id} ev={ev} time={ev.time} isLast={i === proofItems.length - 1} />
                  ))
                )}
              </div>
              <div style={s.proofStats}>
                {([
                  [String(anchorCount), "Total anchors"],
                  [latestBlock.toLocaleString(), "Latest block"],
                  [storageKB.toFixed(1)+" KB", "0G Storage used"],
                  ["Live", "Network status", "#4ade80"],
                ] as [string,string,string?][]).map(([v,l,c]) => (
                  <div key={l} style={s.pstat}>
                    <div style={{...s.pstatVal, ...(c?{color:c}:{})}}>{v}</div>
                    <div style={s.pstatLbl}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

// ─── styles ────────────────────────────────────────────────────────────────────
const s = {
  bgCanvas:     { position:"fixed" as const, inset:0, zIndex:0, pointerEvents:"none" as const },
  glowTop:      { position:"fixed" as const, top:-120, left:"50%", transform:"translateX(-50%)", width:900, height:480, background:"radial-gradient(ellipse, rgba(124,58,237,0.1) 0%, transparent 70%)", pointerEvents:"none" as const, zIndex:1 },
  shell:        { position:"relative" as const, zIndex:10, width:"100%", height:"100%", display:"flex", flexDirection:"column" as const },
  topbar:       { borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(11,11,14,0.92)", backdropFilter:"blur(16px)", boxSizing:"border-box" as const, minHeight:60 },
  topbarBrand:  { display:"flex", alignItems:"center", minWidth:0 },
  brandLink:    { display:"inline-flex", alignItems:"center", gap:8, textDecoration:"none", color:"inherit" },
  brandWordmark:{ fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:700, letterSpacing:"-0.02em", color:"#f5f4f9", lineHeight:1 },
  logoMark:     { width:26, height:26, borderRadius:7, background:"rgba(124,58,237,0.2)", border:"1px solid rgba(124,58,237,0.4)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  topbarCenter: { minWidth:0, width:"100%", position:"relative" as const, paddingLeft:12 },
  identityBlock:{ display:"flex", flexDirection:"column" as const, alignItems:"flex-start", gap:3, width:"100%", maxWidth:"100%" },
  identityHeadline:{ display:"flex", alignItems:"center", flexWrap:"wrap" as const, gap:"6px 10px", rowGap:4 },
  galileoChip:  { display:"inline-flex", alignItems:"center", gap:5, fontFamily:"'Space Mono',monospace", fontSize:8, letterSpacing:"0.14em", textTransform:"uppercase" as const, fontWeight:700, color:"#c4b5fd", padding:"3px 7px", borderRadius:6, border:"1px solid rgba(167,139,250,0.35)", background:"linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(34,211,238,0.06) 100%)", lineHeight:1, flexShrink:0 },
  galileoChipDot:{ width:5, height:5, borderRadius:"50%", background:"#22d3ee", boxShadow:"0 0 6px rgba(34,211,238,0.7)", flexShrink:0 },
  identityTitle:{ margin:0, fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:700, letterSpacing:"-0.02em", color:"#fafafa", lineHeight:1.15 },
  identityPrefix:{ color:"#6b6a80", fontWeight:600 },
  identityHash: { fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, letterSpacing:"-0.02em", color:"#f5f4f9" },
  metaRow:      { display:"flex", alignItems:"center", justifyContent:"flex-start", flexWrap:"wrap" as const, rowGap:4, columnGap:8, fontFamily:"'Space Mono',monospace", fontSize:10, color:"#8b8aa1", lineHeight:1.35, marginTop:1 },
  metaLabel:    { color:"#5c5b70", textTransform:"uppercase" as const, fontSize:8, letterSpacing:"0.1em" },
  metaMono:     { color:"#c4b5fd", fontSize:10, fontWeight:500 },
  metaDot:      { color:"rgba(255,255,255,0.18)", userSelect:"none" as const },
  metaPill:     { fontSize:9, color:"#9bf2be", padding:"2px 8px", borderRadius:999, border:"1px solid rgba(74,222,128,0.28)", background:"rgba(74,222,128,0.08)", whiteSpace:"nowrap" as const },
  metaMuted:    { color:"#5c5b70", fontSize:10, lineHeight:1.4, maxWidth:520 },
  copyBtn:      { display:"inline-flex", alignItems:"center", justifyContent:"center", width:24, height:24, borderRadius:6, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)", cursor:"pointer", color:"#9ca3af", padding:0, flexShrink:0, transition:"background 0.15s, border-color 0.15s" },
  topbarActions:{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const },
  ctaCluster:   { display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" as const, justifyContent:"flex-start" },
  stopMsg:      { fontSize:10, color:"#f87171", maxWidth:130, lineHeight:1.25 },
  liveBadge:    { display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:100, background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.25)", fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, color:"#4ade80", letterSpacing:"0.06em", flexShrink:0 },
  liveBadgeStopped:{ background:"rgba(107,114,128,0.15)", border:"1px solid rgba(156,163,175,0.35)", color:"#9ca3af" },
  liveDot:      { display:"inline-block", width:5, height:5, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 6px rgba(74,222,128,0.85)", animation:"blink 1.8s ease-in-out infinite" },
  tbBtn:        { padding:"5px 12px", borderRadius:8, fontFamily:"'Space Grotesk',sans-serif", fontSize:11, fontWeight:600, cursor:"pointer", border:"none" },
  tbGhost:      { background:"rgba(255,255,255,0.05)", color:"#7a7990", border:"1px solid rgba(255,255,255,0.07)" },
  tbPrimary:    { background:"#7c3aed", color:"#fff" },
  layout:       { display:"grid", gridTemplateColumns:"1fr 340px", overflow:"hidden" },
  colMain:      { display:"flex", flexDirection:"column" as const, overflow:"hidden", borderRight:"1px solid rgba(255,255,255,0.07)" },
  colSide:      { display:"flex", flexDirection:"column" as const, overflow:"hidden" },
  chartPanel:   { padding:"20px 24px 16px", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(17,17,22,0.5)", flexShrink:0 },
  panelHead:    { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap" as const, gap:8 },
  panelTitle:   { fontFamily:"'Space Mono',monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase" as const, color:"#4a4960", fontWeight:700 },
  chartStats:   { display:"flex", gap:24 },
  cstat:        { display:"flex", flexDirection:"column" as const, gap:2 },
  cstatVal:     { fontSize:18, fontWeight:700, letterSpacing:"-0.04em" },
  cstatLbl:     { fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase" as const, color:"#4a4960" },
  chartLegend:  { display:"flex", gap:16, marginTop:10 },
  legendItem:   { display:"flex", alignItems:"center", gap:6, fontFamily:"'Space Mono',monospace", fontSize:10, color:"#4a4960" },
  legendDot:    { width:6, height:6, borderRadius:"50%", flexShrink:0 },
  terminalPanel:{ flex:1, display:"flex", flexDirection:"column" as const, overflow:"hidden", minHeight:0 },
  terminalHead: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 24px", borderBottom:"1px solid rgba(255,255,255,0.04)", background:"rgba(11,11,14,0.6)", flexShrink:0 },
  terminalTabs: { display:"flex", gap:4 },
  tTab:         { padding:"4px 12px", borderRadius:7, border:"none", background:"transparent", fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:500, color:"#7a7990", cursor:"pointer" },
  tTabActive:   { background:"rgba(124,58,237,0.15)", color:"#a78bfa" },
  terminalStatus:{ display:"flex", alignItems:"center", gap:8, fontFamily:"'Space Mono',monospace", fontSize:10, color:"#4a4960" },
  tsDot:        { display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#4ade80", boxShadow:"0 0 6px #4ade80", animation:"blink 1.4s ease-in-out infinite" },
  terminalBody: { flex:1, overflowY:"auto" as const, padding:"16px 24px", fontFamily:"'Space Mono',monospace", fontSize:12, lineHeight:1.75, background:"#08080b", minHeight:0 },
  logLine:      { display:"flex", gap:10, alignItems:"baseline", padding:"1px 0" },
  logTime:      { color:"#5a5870", flexShrink:0, fontSize:10 },
  logTag:       { flexShrink:0, padding:"0 6px", borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:"0.04em" },
  logMsg:       { color:"#c4c3d4", flex:1 },
  cursorLine:   { display:"flex", gap:10, alignItems:"center", paddingTop:4 },
  cursorTag:    { fontSize:10, color:"#4a4960" },
  cursorBlink:  { display:"inline-block", width:8, height:14, background:"#a78bfa", transition:"opacity 0.1s" },
  proofPanel:   { flex:1, display:"flex", flexDirection:"column" as const, overflow:"hidden", background:"linear-gradient(180deg, rgba(15,17,24,0.92) 0%, rgba(11,12,18,0.96) 100%)" },
  proofHead:    { padding:"16px 18px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexShrink:0 },
  proofHeadText:{ display:"flex", flexDirection:"column" as const, gap:3, minWidth:0 },
  proofTitle:   { fontFamily:"'Space Grotesk',sans-serif", fontSize:15, fontWeight:600, letterSpacing:"-0.03em", color:"#f8fafc" },
  proofSubtitle:{ fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:500, color:"#64748b" },
  proofCountPill:{ display:"inline-flex", alignItems:"center", gap:6, flexShrink:0, padding:"6px 11px", borderRadius:999, fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:600, color:"#e2e8f0", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)" },
  proofStream:  { flex:1, overflowY:"auto" as const, padding:"14px 16px 18px", minHeight:0 },
  timelineEmpty:{ margin:0, padding:"20px 8px", fontFamily:"'Space Grotesk',sans-serif", fontSize:13, lineHeight:1.55, color:"#64748b", textAlign:"center" as const },
  timelineRow:  { display:"flex", alignItems:"stretch", gap:0, marginBottom:4 },
  timelineRail: { width:40, flexShrink:0, display:"flex", flexDirection:"column" as const, alignItems:"center" },
  timelineNodeWrap:{ width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", boxShadow:"0 4px 16px rgba(0,0,0,0.2)" },
  timelineConnector:{ width:2, flex:1, minHeight:18, marginTop:6, borderRadius:1, opacity:0.9 },
  timelineCard: { flex:1, minWidth:0, marginLeft:4, marginBottom:12, padding:"12px 14px 12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, boxShadow:"0 1px 0 rgba(255,255,255,0.04) inset" },
  timelineCardTop:{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:6 },
  timelineTitle:{ margin:0, fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:600, letterSpacing:"-0.02em", color:"#f1f5f9", lineHeight:1.3 },
  timelineTime: { fontFamily:"'Space Grotesk',sans-serif", fontSize:11, fontWeight:500, color:"#64748b", whiteSpace:"nowrap" as const, fontVariantNumeric:"tabular-nums" as const },
  timelineDesc: { margin:0, fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:400, color:"rgba(226,232,240,0.72)", lineHeight:1.5, marginBottom:10 },
  timelineFooter:{ display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:"6px 10px", rowGap:8 },
  timelineRefLabel:{ fontFamily:"'Space Grotesk',sans-serif", fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase" as const, letterSpacing:"0.06em" },
  timelineRefValue:{ fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize:11, color:"#94a3b8", maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const },
  timelineVerifiedPill:{ display:"inline-flex", alignItems:"center", gap:5, marginLeft:"auto", padding:"4px 9px", borderRadius:999, fontFamily:"'Space Grotesk',sans-serif", fontSize:10, fontWeight:600, background:"rgba(255,255,255,0.04)", border:"1px solid" },
  proofStats:   { padding:0, borderTop:"1px solid rgba(255,255,255,0.06)", flexShrink:0, display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, background:"rgba(255,255,255,0.03)" },
  pstat:        { background:"rgba(12,14,20,0.85)", padding:"12px 14px" },
  pstatVal:     { fontFamily:"'Space Grotesk',sans-serif", fontSize:15, fontWeight:600, letterSpacing:"-0.02em", color:"#f8fafc" },
  pstatLbl:     { fontFamily:"'Space Grotesk',sans-serif", fontSize:10, fontWeight:500, letterSpacing:"0.04em", textTransform:"uppercase" as const, color:"#64748b", marginTop:4 },
};

// ─── injected CSS ──────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #0b0b0e; overflow: hidden; }
@keyframes blink      { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes pulse-ring { 0%{transform:translateY(-50%) scale(.8);opacity:.8} 100%{transform:translateY(-50%) scale(2.2);opacity:0} }
::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px}
.live-copy-btn:hover {
  background: rgba(124,58,237,0.18) !important;
  border-color: rgba(167,139,250,0.4) !important;
  color: #e9e5ff !important;
}
/* Compact header (~60px tall on desktop); stack only when narrow */
.live-topbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 10px 20px 11px;
  min-height: 60px;
  box-sizing: border-box;
}
.live-topbar-center::before {
  content: "";
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 3px;
  border-radius: 2px;
  background: linear-gradient(180deg, #a78bfa 0%, #22d3ee 100%);
  opacity: 0.85;
}
.live-topbar-actions {
  flex-direction: column;
  align-items: stretch !important;
  gap: 8px !important;
  padding-top: 2px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.live-topbar-actions .ctaCluster {
  justify-content: flex-start !important;
  width: 100%;
}
@media (min-width: 720px) {
  .live-topbar-actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center !important;
    justify-content: flex-start;
    border-top: none;
    padding-top: 0;
    width: auto;
  }
  .live-topbar-actions .ctaCluster {
    width: auto;
    justify-content: flex-end !important;
    flex: 1;
    min-width: 180px;
  }
}
@media (min-width: 1040px) {
  .live-topbar {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 20px 24px;
    padding: 10px 24px 11px;
    min-height: 60px;
  }
  .live-topbar-brand {
    flex: 0 0 auto;
    align-self: center;
  }
  .live-topbar-center {
    flex: 1 1 auto;
    min-width: 0;
    align-self: center;
  }
  .live-topbar-actions {
    flex: 0 0 auto;
    margin-left: auto;
    max-width: 100%;
    justify-content: flex-end;
    align-items: center !important;
    align-self: center;
    border-top: none;
    padding-top: 0;
    width: auto;
    flex-direction: row;
    gap: 10px !important;
  }
  .live-topbar-actions .ctaCluster {
    flex: 0 1 auto;
    justify-content: flex-end !important;
    min-width: 0;
  }
}
@media (max-width: 900px) {
  .responsive-layout { display: flex !important; flex-direction: column !important; overflow-y: auto !important; }
  .responsive-side { min-height: 400px; border-top: 1px solid rgba(255,255,255,0.07); }
}
`;

export default LiveIntelligence;
