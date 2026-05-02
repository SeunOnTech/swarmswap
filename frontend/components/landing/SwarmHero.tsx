"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

// ─── types ────────────────────────────────────────────────────────────────────
interface Node {
  x: number; y: number;
  vx: number; vy: number;
  r: number; pulse: number;
}

interface TickerItem {
  name: string; val: string; up: boolean;
}

// ─── SwarmSwap Data ──────────────────────────────────────────────────────────
const TICKER_ITEMS: TickerItem[] = [
  { name: "LP Swarm #102",  val: "+14.2%", up: true  },
  { name: "Analyzer #01",   val: "Active",  up: true  },
  { name: "Risk Agent",     val: "Shielding", up: true  },
  { name: "0G Galileo",     val: "166ms",  up: true  },
  { name: "Sepolia ETH",    val: "+2.4%",  up: true  },
  { name: "Consensus",      val: "100%",   up: true  },
  { name: "Swarm Yield",    val: "+19.2%", up: true  },
  { name: "IL Avoided",     val: "$720",   up: true  },
  { name: "iNFT Anchor",    val: "Synced",  up: true  },
  { name: "0G Storage",     val: "Turbo",   up: true  },
];

const ORBIT_SM: { angle: number; label: string; color: string }[] = [
  { angle: 50,  label: "Analyzer",   color: "#a78bfa" }, // Original Purple
  { angle: 210, label: "Risk Shield", color: "#f472b6" }, // Original Pink
];

const ORBIT_LG: { angle: number; label: string; color: string }[] = [
  { angle: 20,  label: "0G Consensus",   color: "#4ade80" },
  { angle: 135, label: "Sepolia Exec",   color: "#818cf8" },
  { angle: 265, label: "iNFT Identity",  color: "#fb923c" },
];

// ─── sub-components ───────────────────────────────────────────────────────────
const LogoIcon: React.FC<{ size?: number }> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 38 38" fill="none">
    <path
      d="M25 7H13C9.686 7 7 9.686 7 13v1c0 2.21 1.79 4 4 4h10c3.314 0 6 2.686 6 6v1c0 3.314-2.686 6-6 6H9"
      stroke="white" strokeWidth="2.8" strokeLinecap="round"
    />
    <path d="M14 4l-4 3 4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 28l4 3-4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChipDot: React.FC<{ color: string }> = ({ color }) => (
  <span style={{
    width: 6, height: 6, borderRadius: "50%",
    background: color, flexShrink: 0, display: "inline-block",
  }} />
);

// ─── main component ───────────────────────────────────────────────────────────
const SwarmHero: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const heroRef   = useRef<HTMLElement>(null);

  // canvas animation (Plexus Effect)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let W = 0, H = 0;
    let nodes: Node[] = [];

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      nodes = Array.from({ length: 60 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.5 + 0.5, pulse: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.018;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(139,92,246,${alpha})`; // Original Purple
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        const p = (Math.sin(n.pulse) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + p * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167,139,250,${0.12 + p * 0.18})`;
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

  // entrance fade-in
  useEffect(() => {
    const items = heroRef.current?.querySelectorAll<HTMLElement>(".fade-item");
    items?.forEach((el, i) => {
      setTimeout(() => el.classList.add("in"), 80 + i * 80);
    });
  }, []);

  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <>
      <style>{CSS}</style>

      <canvas ref={canvasRef} style={s.canvas} />
      <div style={s.glowOrb} />

      <section ref={heroRef} style={s.hero}>

        {/* logo */}
        <div className="fade-item" style={s.logoWrap}>
          <div style={s.logoRing}>
            <LogoIcon size={38} />
          </div>
        </div>

        {/* badge */}
        <div className="fade-item" style={s.badge}>
          <span style={s.badgeDot} />
          Autonomous Agents Active on 0G
        </div>

        {/* headline */}
        <h1 className="fade-item" style={s.headline}>
          Autonomous Swarms<br />
          <em style={s.headlineEm}>for your Liquidity</em>
        </h1>

        {/* sub */}
        <p className="fade-item" style={s.sub}>
          Deploy agentic LPs that self-coordinate on <strong style={s.subStrong}>0G Storage</strong> and execute on 
          <strong style={s.subStrong}> Uniswap</strong>. No manual rebalancing. Just yield.
        </p>

        {/* CTAs */}
        <div className="fade-item" style={s.ctaGroup}>
          <Link href="/app" style={s.btnPrimary}>
            Launch App
            <svg width={15} height={15} viewBox="0 0 15 15" fill="none">
              <path d="M2.5 7.5h10M9 4l3.5 3.5L9 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <a href="#how-it-works" style={s.btnSecondary}>
            How it Works
            <svg width={13} height={13} viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5h9M8 3.5L11 6.5 8 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {/* stats */}
        <div className="fade-item" style={s.statsRow}>
          {[
            { val: "100%", lbl: "Autonomous Quorum" },
            { val: "68k+",  lbl: "0G State Anchors" },
            { val: "2.4s",  lbl: "Consensus Latency" },
          ].map((stat, i) => (
            <div key={i} style={{ ...s.stat, ...(i > 0 ? s.statBorder : {}) }}>
              <span style={s.statVal}>{stat.val}</span>
              <span style={s.statLbl}>{stat.lbl}</span>
            </div>
          ))}
        </div>

        {/* orbit visualization */}
        <div className="fade-item" style={s.orbitScene} aria-hidden="true">

          <div style={{ ...s.orbitRing, ...s.ringLg }}>
            {ORBIT_LG.map((node, i) => (
              <div key={i} className="a-node-lg" style={{ ...s.aNode, transformOrigin: "0 155px", transform: `rotate(${node.angle}deg)` }}>
                <div className="a-chip-lg" style={s.aChip}>
                  <ChipDot color={node.color} /> {node.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...s.orbitRing, ...s.ringSm }}>
            {ORBIT_SM.map((node, i) => (
              <div key={i} className="a-node-sm" style={{ ...s.aNode, transformOrigin: "0 90px", transform: `rotate(${node.angle}deg)` }}>
                <div className="a-chip-sm" style={s.aChip}>
                  <ChipDot color={node.color} /> {node.label}
                </div>
              </div>
            ))}
          </div>

          <div style={s.orbitCenter}>
            <LogoIcon size={30} />
          </div>
        </div>

      </section>

      {/* ticker */}
      <div style={s.tickerWrap}>
        <div style={s.tickerTrack}>
          {doubled.map((item, i) => (
            <span key={i} style={s.tItem}>
              <span style={s.tName}>{item.name}</span>
              <span style={item.up ? s.tUp : s.tDown}>{item.val}</span>
              <span style={s.tSep}>·</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
};

// ─── styles ────────────────────────────────────────────────────────────────────
const s = {
  canvas: {
    position: "fixed" as const, inset: 0, zIndex: 0, pointerEvents: "none" as const,
  },
  glowOrb: {
    position: "fixed" as const, top: "38%", left: "50%",
    transform: "translate(-50%, -50%)",
    width: 900, height: 600,
    background: "radial-gradient(ellipse at center, rgba(124,58,237,0.18) 0%, rgba(109,40,217,0.07) 40%, transparent 70%)",
    pointerEvents: "none" as const, zIndex: 1, animation: "orb-breathe 6s ease-in-out infinite",
  },
  hero: {
    position: "relative" as const, zIndex: 2,
    minHeight: "100svh", display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    padding: "80px 24px", textAlign: "center" as const,
    fontFamily: "'Space Grotesk', sans-serif", color: "#f5f4f9",
  },
  logoWrap: { marginBottom: 36 },
  logoRing: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 68, height: 68, borderRadius: 17,
    background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.4)",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.1), 0 0 32px rgba(124,58,237,0.3), 0 0 72px rgba(124,58,237,0.12), inset 0 1px 0 rgba(255,255,255,0.09)",
    animation: "logo-pulse 3.5s ease-in-out infinite",
  },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "5px 14px 5px 10px", borderRadius: 100,
    background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)",
    fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.06em",
    color: "#a78bfa", marginBottom: 28,
  },
  badgeDot: {
    width: 7, height: 7, borderRadius: "50%", background: "#a78bfa",
    boxShadow: "0 0 8px #a78bfa", animation: "dot-blink 1.8s ease-in-out infinite",
    display: "inline-block",
  },
  headline: {
    fontSize: "clamp(46px, 7vw, 84px)", fontWeight: 700,
    lineHeight: 1.05, letterSpacing: "-0.035em",
    marginBottom: 22, textWrap: "balance" as never,
  },
  headlineEm: {
    fontStyle: "normal",
    background: "linear-gradient(130deg, #c4b5fd 0%, #8b5cf6 40%, #7c3aed 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  },
  sub: {
    maxWidth: 500, fontSize: "clamp(15px, 1.5vw, 17px)", lineHeight: 1.7,
    color: "#8b8aa0", marginBottom: 44, textWrap: "pretty" as never,
  },
  subStrong: { color: "#c4b5fd", fontWeight: 500 },
  ctaGroup: {
    display: "flex", alignItems: "center", gap: 12,
    flexWrap: "wrap" as const, justifyContent: "center", marginBottom: 52,
  },
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "14px 26px", borderRadius: 12, background: "#7c3aed",
    color: "#fff", fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em",
    border: "none", cursor: "pointer", textDecoration: "none",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 0 0 1px rgba(124,58,237,0.5), 0 4px 28px rgba(124,58,237,0.45)",
    position: "relative" as const, overflow: "hidden",
  },
  btnSecondary: {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "14px 22px", borderRadius: 12,
    background: "rgba(255,255,255,0.03)", color: "#a09fba",
    fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 500,
    border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer",
    transition: "transform 0.15s ease, background 0.15s ease, color 0.15s ease",
    textDecoration: "none", backdropFilter: "blur(8px)",
  },
  statsRow: { display: "flex", alignItems: "center", marginBottom: 56 },
  stat:    { padding: "0 28px", textAlign: "center" as const },
  statBorder: { borderLeft: "1px solid rgba(255,255,255,0.07)" },
  statVal: { display: "block", fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em", color: "#f5f4f9" },
  statLbl: { display: "block", fontSize: 12, color: "#8b8aa0", letterSpacing: "0.01em", marginTop: 3 },
  orbitScene: { position: "relative" as const, width: 360, height: 360 },
  orbitCenter: {
    position: "absolute" as const, top: "50%", left: "50%",
    transform: "translate(-50%,-50%)", width: 64, height: 64, borderRadius: 16,
    background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 0 40px rgba(124,58,237,0.35)", zIndex: 2,
  },
  orbitRing: {
    position: "absolute" as const, top: "50%", left: "50%", borderRadius: "50%",
  },
  ringSm: {
    width: 180, height: 180, margin: "-90px 0 0 -90px",
    border: "1px dashed rgba(124,58,237,0.13)", animation: "spin 12s linear infinite",
  },
  ringLg: {
    width: 310, height: 310, margin: "-155px 0 0 -155px",
    border: "1px solid rgba(124,58,237,0.07)", animation: "spin 20s linear infinite reverse",
  },
  aNode: { position: "absolute" as const, top: 0, left: "50%", display: "flex", alignItems: "center" },
  aChip: {
    display: "flex", alignItems: "center", gap: 7, padding: "7px 11px",
    borderRadius: 9, background: "rgba(13,12,20,0.85)",
    border: "1px solid rgba(124,58,237,0.22)", fontSize: 11.5, fontWeight: 500,
    color: "#c4b5fd", whiteSpace: "nowrap" as const,
    backdropFilter: "blur(12px)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },
  tickerWrap: {
    position: "fixed" as const, bottom: 0, left: 0, right: 0,
    borderTop: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(11,11,14,0.8)", backdropFilter: "blur(12px)",
    padding: "11px 0", overflow: "hidden", zIndex: 10,
    WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)",
    maskImage: "linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)",
  },
  tickerTrack: {
    display: "flex", gap: 40, width: "max-content", animation: "ticker 30s linear infinite",
  },
  tItem: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, flexShrink: 0, letterSpacing: "0.03em", color: "#4a4960" },
  tName: { color: "#6b6a85" },
  tUp:   { color: "#4ade80" },
  tDown: { color: "#f87171" },
  tSep:  { color: "#252430" },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: #0b0b0e; overflow-x: hidden; }

@keyframes orb-breathe {
  0%,100% { opacity:.8; transform:translate(-50%,-50%) scale(1); }
  50%      { opacity:1;  transform:translate(-50%,-52%) scale(1.06); }
}
@keyframes logo-pulse {
  0%,100% { box-shadow: 0 0 0 1px rgba(124,58,237,.1), 0 0 32px rgba(124,58,237,.3), 0 0 72px rgba(124,58,237,.12), inset 0 1px 0 rgba(255,255,255,.09); }
  50%      { box-shadow: 0 0 0 1px rgba(124,58,237,.22), 0 0 52px rgba(124,58,237,.45), 0 0 100px rgba(124,58,237,.2), inset 0 1px 0 rgba(255,255,255,.13); }
}
@keyframes dot-blink {
  0%,100% { opacity:1; }
  50%      { opacity:.25; }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

.a-node-sm .a-chip-sm { animation: counter-sm 12s linear infinite; }
.a-node-lg .a-chip-lg { animation: counter-lg 20s linear infinite reverse; }
@keyframes counter-sm {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}
@keyframes counter-lg {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.fade-item { opacity: 0; transform: translateY(16px); transition: opacity .65s cubic-bezier(.22,1,.36,1), transform .65s cubic-bezier(.22,1,.36,1); }
.fade-item.in { opacity: 1; transform: translateY(0); }
`;

export default SwarmHero;
