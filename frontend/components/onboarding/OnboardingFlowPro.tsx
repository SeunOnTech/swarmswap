"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useDisconnect } from "wagmi";
import { networks } from "@/lib/web3";

type ChainName = "Ethereum" | "Arbitrum" | "Base" | "Sepolia";
type SponsorshipTier = "Free" | "Pro" | "Custom";
type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
type Trigger = "3%" | "5%" | "8%";
type Slippage = "0.3%" | "0.5%" | "1.0%";
type TickStrategy = "Dynamic" | "Concentrated" | "Wide Range";

type Position = {
  id: string;
  chain: ChainName;
  pool: string;
  feeTier: string;
  range: string;
  tvl: string;
  fees24h: string;
  ilRisk: "Low" | "Medium" | "High";
};

type BgNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
};

const POSITIONS: Position[] = [
  { id: "p1", chain: "Ethereum", pool: "ETH / USDC", feeTier: "0.05%", range: "$3,120-$3,920", tvl: "$182,400", fees24h: "$412", ilRisk: "Medium" },
  { id: "p2", chain: "Arbitrum", pool: "ARB / ETH", feeTier: "0.30%", range: "0.00062-0.00091", tvl: "$64,220", fees24h: "$228", ilRisk: "High" },
  { id: "p3", chain: "Base", pool: "cbBTC / ETH", feeTier: "0.05%", range: "13.2-15.8", tvl: "$91,080", fees24h: "$305", ilRisk: "Low" },
  { id: "p4", chain: "Sepolia", pool: "WETH / USDC", feeTier: "1.00%", range: "$2,900-$4,200", tvl: "$18,540", fees24h: "$49", ilRisk: "Low" },
];

const steps = ["Connect", "Create", "Mint", "LP Setup", "Delegation", "Activate"];

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path d="M25 7H13C9.686 7 7 9.686 7 13v1c0 2.21 1.79 4 4 4h10c3.314 0 6 2.686 6 6v1c0 3.314-2.686 6-6 6H9" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M14 4l-4 3 4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 28l4 3-4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5l8 7-8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  options: readonly T[] | T[];
  value: T;
  onChange: (v: T) => void;
};

function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="field">
      <p className="field-label">{label}</p>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option}
            className={`seg-btn ${value === option ? "active" : ""}`}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingFlowPro() {
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const [step, setStep] = useState(1);
  
  const walletAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}` 
    : "0x0000...0000";

  const [smartAddress, setSmartAddress] = useState("0xA56B...44F1");
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [swarmId, setSwarmId] = useState<number | null>(null);
  const [configURI, setConfigURI] = useState<string>("");
  const [stateURI, setStateURI] = useState<string>("");
  const [filter, setFilter] = useState<"All" | ChainName>("All");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [sponsorshipTier, setSponsorshipTier] = useState<SponsorshipTier>("Free");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [rebalanceTrigger, setRebalanceTrigger] = useState<Trigger>("5%");
  const [slippage, setSlippage] = useState<Slippage>("0.5%");
  const [tickStrategy, setTickStrategy] = useState<TickStrategy>("Dynamic");
  const [tickProximity, setTickProximity] = useState("5%");
  const [maxGas, setMaxGas] = useState("0.005 ETH");
  const [freq, setFreq] = useState("15 min");

  const visiblePositions = useMemo(() => {
    if (filter === "All") return POSITIONS;
    return POSITIONS.filter((p) => p.chain === filter);
  }, [filter]);

  const activateCreate = () => {
    const id = Math.floor(Math.random() * 9000) + 1000;
    setSwarmId(id);
    setConfigURI(`0g://swarms/${id}/config.json`);
    setStateURI(`0g://swarms/${id}/state.json`);
    setStep(3);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: BgNode[] = [];

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      nodes = Array.from({ length: 60 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.5 + 0.5,
        pulse: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        node.pulse += 0.018;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      });

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 130) {
            const alpha = (1 - distance / 130) * 0.1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(139,92,246,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }

      nodes.forEach((node) => {
        const pulse = (Math.sin(node.pulse) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + pulse * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,139,250,${0.12 + pulse * 0.18})`;
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(draw);
    };

    init();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (!showProcessing) return;
    const timer = setTimeout(() => {
      setShowProcessing(false);
      setShowSmartModal(true);
    }, 1800);
    return () => clearTimeout(timer);
  }, [showProcessing]);

  useEffect(() => {
    if (isConnected && step === 1) {
      setStep(2);
    }
  }, [isConnected, step]);

  return (
    <div className="onboard-wrap">
      <style>{css}</style>
      <canvas ref={canvasRef} className="bg-canvas" />
      <div className="bg-glow" />
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-mark"><LogoIcon /></span>
          SwarmSwap
        </Link>
        <div className="header-right">
          <span className="status">Onboarding Demo</span>
          <span className="counter">{step}/{steps.length}</span>
        </div>
      </header>

      <main className="layout">
        <aside className="rail">
          {steps.map((name, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={name} className={`rail-item ${active ? "active" : ""}`}>
                <span className={`rail-dot ${done ? "done" : ""}`}>{done ? <CheckIcon /> : n}</span>
                <span>{name}</span>
              </div>
            );
          })}
        </aside>

        <section className="panel">
          {step === 1 && (
            <>
              <h1>Connect wallet</h1>
              <p className="sub">Start with a single secure AppKit connection. Advanced account setup will happen later after LP context is selected.</p>
              <div className="connect-stage">
                <div className="connect-center">
                  <p className="connect-label">Universal wallet entry</p>
                  <button
                    className="btn primary connect-cta"
                    onClick={() => open()}
                  >
                    {isConnected ? "Connected" : "Connect Wallet"} <ArrowIcon />
                  </button>
                  <p className="connect-hint">Supports MetaMask, Coinbase, Rainbow and social-auth behind AppKit.</p>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>Create swarm</h1>
              <p className="sub">Set risk, trigger, slippage, and strategy. Backend would generate and persist this config.</p>
              <div className="field-grid">
                <Segmented label="Risk Profile" options={["Conservative", "Balanced", "Aggressive"]} value={riskProfile} onChange={setRiskProfile} />
                <Segmented label="Rebalance Trigger" options={["3%", "5%", "8%"]} value={rebalanceTrigger} onChange={setRebalanceTrigger} />
                <Segmented label="Slippage Limit" options={["0.3%", "0.5%", "1.0%"]} value={slippage} onChange={setSlippage} />
                <Segmented label="Tick Strategy" options={["Dynamic", "Concentrated", "Wide Range"]} value={tickStrategy} onChange={setTickStrategy} />
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn primary" onClick={activateCreate}>Generate Swarm <ArrowIcon /></button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1>Mint iNFT on 0G Galileo</h1>
              <p className="sub">One signature transaction flow. In smart account mode, this can run as UserOperation.</p>
              <div className="snapshot">
                <p><span>Swarm</span><strong>Swarm #{swarmId}</strong></p>
                <p><span>Config URI</span><strong>{configURI}</strong></p>
                <p><span>State URI</span><strong>{stateURI}</strong></p>
                <p><span>Permissions</span><strong>Agent wallet granted 0x7857abcd</strong></p>
              </div>
              <div className="callout">
                <CheckIcon /> Swarm #{swarmId} created and ready for LP autonomy.
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setStep(2)}>Back</button>
                <button className="btn primary" onClick={() => setStep(4)}>Select LP <ArrowIcon /></button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1>LP selection and strategy</h1>
              <p className="sub">Filter positions by chain and set per-position autonomy constraints.</p>
              <Segmented label="Chain Filter" options={["All", "Ethereum", "Arbitrum", "Base", "Sepolia"]} value={filter} onChange={setFilter} />
              <div className="position-list">
                {visiblePositions.map((p) => {
                  const selected = selectedPositions.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`position ${selected ? "selected" : ""}`}
                      onClick={() =>
                        setSelectedPositions((prev) => (prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]))
                      }
                    >
                      <div className="position-top">
                        <strong>{p.pool}</strong>
                        <span>{p.chain}</span>
                      </div>
                      <div className="position-meta">
                        <p>Fee {p.feeTier}</p>
                        <p>Range {p.range}</p>
                        <p>TVL {p.tvl}</p>
                        <p>24h {p.fees24h}</p>
                        <p>IL {p.ilRisk}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="field-grid">
                <Segmented label="Tick Proximity" options={["3%", "5%", "8%"]} value={tickProximity} onChange={setTickProximity} />
                <Segmented label="Max Gas / Cycle" options={["0.003 ETH", "0.005 ETH", "0.01 ETH"]} value={maxGas} onChange={setMaxGas} />
                <Segmented label="Rebalance Frequency" options={["5 min", "15 min", "30 min"]} value={freq} onChange={setFreq} />
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
                <button
                  className="btn primary"
                  disabled={selectedPositions.length === 0}
                  onClick={() => setShowProcessing(true)}
                >
                  Continue <ArrowIcon />
                </button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1>Delegation and paymaster policy</h1>
              <p className="sub">Session scope and sponsorship tier setup before autonomous execution begins.</p>
              <div className="permission">
                <h3>Execution rights request</h3>
                <ul>
                  <li>Allowed contracts: SwapRouter02, NonfungiblePositionManager</li>
                  <li>Functions: exactInputSingle, mint, burn, collect</li>
                  <li>Max gas budget: 0.5 ETH/month</li>
                  <li>Expiry: 30 days renewable</li>
                  <li>Chain: Ethereum Mainnet</li>
                </ul>
              </div>
              <Segmented label="Sponsorship Tier" options={["Free", "Pro", "Custom"]} value={sponsorshipTier} onChange={setSponsorshipTier} />
              <div className="actions">
                <button className="btn ghost" onClick={() => setStep(4)}>Back</button>
                <button className="btn primary" onClick={() => setStep(6)}>Sign Delegation <CheckIcon /></button>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <h1>Agent active</h1>
              <p className="sub">Onboarding is complete and autonomy has been activated for selected LP positions.</p>
              <div className="snapshot">
                <p><span>Status</span><strong>Gas sponsored and active, next cycle 15s</strong></p>
                <p><span>Sponsorship</span><strong>{sponsorshipTier}</strong></p>
                <p><span>Delegation</span><strong>Session key anchored to 0G iNFT state</strong></p>
                <p><span>Positions</span><strong>{selectedPositions.length} position(s) configured</strong></p>
              </div>
              <div className="actions">
                <button className="btn ghost" onClick={() => setStep(1)}>Restart</button>
                <Link href="/app/dashboard" className="btn primary link-btn">Go to Dashboard <ArrowIcon /></Link>
              </div>
            </>
          )}
        </section>
      </main>

      {showProcessing && (
        <div className="modal-backdrop" role="status" aria-live="polite" aria-label="Loading">
          <div className="loader-shell" aria-hidden="true">
            <span className="loader-ring ring-a" />
            <span className="loader-ring ring-b" />
            <span className="loader-core" />
          </div>
        </div>
      )}

      {showSmartModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Smart account linkage">
          <div className="modal-card">
            <h2>Smart account setup</h2>
            <p className="sub">Swarm agent interactions route through your dedicated smart account, cryptographically linked to your wallet.</p>
            <div className="link-visual">
              <div className="node">
                <span className="node-label">Wallet</span>
                <strong>{walletAddress}</strong>
              </div>
              <div className="link-track">
                <span className="pulse" />
                <span className="pulse delay" />
              </div>
              <div className="node">
                <span className="node-label">Smart Account</span>
                <strong>{smartAddress}</strong>
              </div>
            </div>
            <div className="trust-grid">
              <p><CheckIcon /> You approve permissions with signatures</p>
              <p><CheckIcon /> Agent cannot access unrelated contracts</p>
              <p><CheckIcon /> Session keys are renewable and time-bounded</p>
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={() => setShowSmartModal(false)}>Cancel</button>
              <button
                className="btn primary"
                onClick={() => {
                  setSmartAddress("0xA56B...44F1");
                  setShowSmartModal(false);
                  setStep(5);
                }}
              >
                Continue <ArrowIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
.onboard-wrap {
  min-height: 100svh;
  background: #0b0b0e;
  color: #f5f4f9;
  position: relative;
}

.bg-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.bg-glow {
  position: fixed;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 900px;
  height: 600px;
  background: radial-gradient(ellipse at center, rgba(124,58,237,0.18) 0%, rgba(109,40,217,0.07) 40%, transparent 70%);
  pointer-events: none;
  z-index: 1;
  animation: orb-breathe 6s ease-in-out infinite;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(11,11,14,0.92);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 12;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 700;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid rgba(124,58,237,0.5);
  background: rgba(124,58,237,0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.header-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.status,
.counter {
  height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
}

.status {
  border: 1px solid rgba(124,58,237,0.45);
  background: rgba(124,58,237,0.14);
  color: #c4b5fd;
}

.counter {
  border: 1px solid rgba(255,255,255,0.15);
  color: #9f9db8;
}

.layout {
  width: min(1200px, 100%);
  margin: 0 auto;
  padding: 16px;
  display: grid;
  grid-template-columns: 260px minmax(0,1fr);
  gap: 14px;
  position: relative;
  z-index: 2;
}

.rail {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  background: #111117;
  padding: 10px;
  height: fit-content;
}

.connect-stage {
  min-height: 320px;
  display: grid;
  place-items: center;
}

.connect-center {
  width: min(560px, 100%);
  border: 1px solid rgba(255,255,255,0.12);
  background: #14141d;
  border-radius: 16px;
  padding: 26px;
  text-align: center;
}

.connect-label {
  margin: 0;
  color: #a4a2bb;
  font-size: 13px;
}

.connect-cta {
  margin-top: 14px;
  height: 46px;
  font-size: 15px;
  padding: 0 20px;
}

.connect-hint {
  margin: 12px 0 0;
  color: #8f8da8;
  font-size: 12px;
  line-height: 1.5;
}

.rail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #86849f;
  border-radius: 10px;
  padding: 8px;
  font-size: 14px;
}

.rail-item.active {
  background: #1a1826;
  color: #f5f4f9;
}

.rail-dot {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.rail-dot.done {
  border-color: rgba(74,222,128,0.45);
  color: #86efac;
}

.panel {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  background: #111117;
  padding: 18px;
}

h1 {
  margin: 0;
  font-size: clamp(25px, 4vw, 38px);
  letter-spacing: -0.03em;
}

.sub {
  margin: 8px 0 0;
  color: #9e9cb6;
  line-height: 1.6;
}

.card-grid {
  margin-top: 16px;
  display: grid;
  gap: 10px;
}

.card-grid.three {
  grid-template-columns: repeat(3, minmax(0,1fr));
}

.choice {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #14141d;
  text-align: left;
  color: #f5f4f9;
  padding: 14px;
  display: grid;
  gap: 8px;
  cursor: pointer;
}

.choice:hover {
  border-color: rgba(124,58,237,0.6);
}

.choice span {
  color: #9b99b3;
  font-size: 12px;
}

.field-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 12px;
}

.field {
  margin-top: 14px;
}

.field-label {
  margin: 0 0 8px;
  color: #a8a6bf;
  font-size: 12px;
}

.segmented {
  border: 1px solid rgba(255,255,255,0.12);
  background: #14141d;
  border-radius: 12px;
  padding: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.seg-btn {
  border: none;
  height: 34px;
  border-radius: 9px;
  padding: 0 12px;
  background: transparent;
  color: #9f9db7;
  cursor: pointer;
}

.seg-btn.active {
  background: #201c33;
  color: #ddd6fe;
  box-shadow: inset 0 0 0 1px rgba(124,58,237,0.5);
}

.snapshot {
  margin-top: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #14141d;
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.snapshot p {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.snapshot span {
  color: #9e9cb6;
}

.snapshot strong {
  color: #f5f4f9;
  text-align: right;
  overflow-wrap: anywhere;
}

.callout {
  margin-top: 12px;
  border: 1px solid rgba(74,222,128,0.35);
  background: rgba(22,101,52,0.25);
  color: #bbf7d0;
  border-radius: 10px;
  padding: 10px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.position-list {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.position {
  border: 1px solid rgba(255,255,255,0.11);
  background: #14141d;
  border-radius: 11px;
  padding: 12px;
  text-align: left;
  color: inherit;
  cursor: pointer;
}

.position.selected {
  border-color: rgba(124,58,237,0.6);
  background: #1a1826;
}

.position-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.position-top strong {
  font-size: 14px;
}

.position-top span {
  font-size: 12px;
  color: #a6a4bd;
}

.position-meta {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 6px;
}

.position-meta p {
  margin: 0;
  color: #9e9cb6;
  font-size: 12px;
}

.permission {
  margin-top: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #14141d;
  border-radius: 12px;
  padding: 12px;
}

.permission h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.permission ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 5px;
  color: #b5b3ca;
  font-size: 13px;
}

.actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  height: 38px;
  border-radius: 10px;
  border: none;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: #7c3aed;
  color: white;
}

.btn.ghost {
  border: 1px solid rgba(255,255,255,0.15);
  background: transparent;
  color: #b3b2c6;
}

.link-btn {
  text-decoration: none;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(5,5,9,0.68);
  display: grid;
  place-items: center;
  padding: 16px;
}

.modal-card {
  width: min(720px, 100%);
  border: 1px solid rgba(255,255,255,0.14);
  background: #12121a;
  border-radius: 16px;
  padding: 20px;
  animation: modal-in 220ms ease-out;
}

.loader-shell {
  width: 86px;
  height: 86px;
  position: relative;
  animation: loader-breathe 1400ms ease-in-out infinite;
}

.loader-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(167,139,250,0.45);
}

.loader-ring.ring-a {
  animation: ring-spin-a 900ms linear infinite;
}

.loader-ring.ring-b {
  inset: 10px;
  border-color: rgba(124,58,237,0.5);
  animation: ring-spin-b 1200ms linear infinite reverse;
}

.loader-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: #a78bfa;
  box-shadow: 0 0 0 8px rgba(167,139,250,0.14);
}

.modal-card h2 {
  margin: 0;
  font-size: 24px;
  letter-spacing: -0.02em;
}

.link-visual {
  margin-top: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  background: #14141d;
  padding: 14px;
  display: grid;
  grid-template-columns: minmax(0,1fr) 100px minmax(0,1fr);
  align-items: center;
  gap: 10px;
}

.node {
  border: 1px solid rgba(124,58,237,0.45);
  border-radius: 10px;
  padding: 10px;
  background: #181726;
  display: grid;
  gap: 6px;
}

.node-label {
  font-size: 12px;
  color: #adaac4;
}

.node strong {
  font-size: 13px;
  color: #f5f4f9;
}

.link-track {
  height: 2px;
  background: rgba(124,58,237,0.35);
  position: relative;
  border-radius: 999px;
  overflow: hidden;
}

.pulse {
  width: 26px;
  height: 100%;
  background: #a78bfa;
  position: absolute;
  left: -30px;
  top: 0;
  border-radius: 999px;
  animation: travel 1.8s linear infinite;
}

.pulse.delay {
  animation-delay: 900ms;
}

.trust-grid {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.trust-grid p {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #bbb9ce;
  font-size: 13px;
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .card-grid.three,
  .field-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 700px) {
  .header {
    padding: 0 10px;
  }
  .status {
    display: none;
  }
  .layout {
    padding: 10px;
  }
  .panel {
    padding: 14px;
  }
  .card-grid.three,
  .field-grid,
  .position-meta {
    grid-template-columns: 1fr;
  }
  .actions .btn,
  .actions .link-btn {
    width: 100%;
    justify-content: center;
  }
  .link-visual {
    grid-template-columns: 1fr;
  }
  .link-track {
    height: 56px;
    width: 2px;
    margin: 0 auto;
  }
  .pulse {
    width: 100%;
    height: 26px;
    left: 0;
    top: -30px;
    animation: travel-y 1.8s linear infinite;
  }
  .pulse.delay {
    animation-delay: 900ms;
  }
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes orb-breathe {
  0%,100% { opacity: .8; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -52%) scale(1.06); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes loader-breathe {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.06); opacity: 1; }
}

@keyframes ring-spin-a {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes ring-spin-b {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes travel {
  from { transform: translateX(0); }
  to { transform: translateX(150px); }
}

@keyframes travel-y {
  from { transform: translateY(0); }
  to { transform: translateY(80px); }
}
`;
