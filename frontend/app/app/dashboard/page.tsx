"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path
        d="M25 7H13C9.686 7 7 9.686 7 13v1c0 2.21 1.79 4 4 4h10c3.314 0 6 2.686 6 6v1c0 3.314-2.686 6-6 6H9"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path d="M14 4l-4 3 4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 28l4 3-4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Swarm = {
  id: number;
  strategy: string;
  status: "Active" | "Monitoring" | "Needs Review";
  positions: number;
  pnl: string;
  yield24h: string;
  nextCycle: string;
  chain: string;
};

const SWARMS: Swarm[] = [
  { id: 1842, strategy: "Dynamic Edge Defense", status: "Active", positions: 3, pnl: "+12.4%", yield24h: "+0.64%", nextCycle: "12s", chain: "Ethereum" },
  { id: 2071, strategy: "Tight Range Momentum", status: "Monitoring", positions: 2, pnl: "+8.1%", yield24h: "+0.33%", nextCycle: "36s", chain: "Arbitrum" },
  { id: 2230, strategy: "Wide Range Carry", status: "Needs Review", positions: 4, pnl: "-1.2%", yield24h: "+0.08%", nextCycle: "Paused", chain: "Base" },
];

const EVENTS = [
  { time: "Now", text: "Swarm #1842 rebalanced ETH/USDC position near upper edge." },
  { time: "2m", text: "Session key policy refreshed for Swarm #2071." },
  { time: "9m", text: "Gas sponsorship consumed 0.0021 ETH from Pro pool." },
  { time: "14m", text: "Risk analyzer flagged widening volatility on Base." },
];

export default function DashboardPage() {
  const activeCount = SWARMS.filter((s) => s.status === "Active").length;
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 760);
      setIsTablet(window.innerWidth < 1180);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main style={{ ...s.page, padding: isMobile ? 10 : 20 }}>
      <div style={s.orbA} />
      <div style={s.orbB} />
      <div style={s.shell}>
        <header style={{ ...s.header, padding: isMobile ? "10px 11px" : "12px 14px" }}>
          <Link href="/" style={s.brand}>
            <span style={s.brandMark}>
              <LogoIcon />
            </span>
            SwarmSwap
          </Link>
          <div style={{ ...s.headerActions, gap: isMobile ? 6 : 8 }}>
            <Link href="/app" style={s.ctaGhost}>
              Onboarding
            </Link>
            <Link href="/app" style={s.cta}>
              Create Swarm
            </Link>
          </div>
        </header>

        <section
          style={{
            ...s.grid,
            gridTemplateColumns: isTablet ? "1fr" : s.grid.gridTemplateColumns,
          }}
        >
          <div
            style={{
              ...s.kpiRow,
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : s.kpiRow.gridTemplateColumns,
            }}
          >
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Total Swarms</p>
              <strong style={s.kpiValue}>{SWARMS.length}</strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Active Now</p>
              <strong style={s.kpiValue}>{activeCount}</strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>24h Swarm Yield</p>
              <strong style={s.kpiValue}>+1.05%</strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Gas Sponsored</p>
              <strong style={s.kpiValue}>0.021 ETH</strong>
            </article>
          </div>

          <article style={s.mainPanel}>
            <div style={s.panelHead}>
              <h1 style={s.title}>My Swarms</h1>
              <button style={s.filterBtn}>Filter Active</button>
            </div>
            <p style={s.copy}>Autonomous swarms currently orchestrating your Uniswap LP positions.</p>
            <div style={s.swarmList}>
              {SWARMS.map((swarm) => (
                <div key={swarm.id} style={s.swarmCard}>
                  <div style={s.swarmTop}>
                    <div>
                      <p style={s.swarmId}>Swarm #{swarm.id}</p>
                      <h3 style={s.swarmTitle}>{swarm.strategy}</h3>
                    </div>
                    <span
                      style={{
                        ...s.statusPill,
                        ...(swarm.status === "Active"
                          ? s.statusActive
                          : swarm.status === "Monitoring"
                            ? s.statusMonitoring
                            : s.statusReview),
                      }}
                    >
                      {swarm.status}
                    </span>
                  </div>
                  <div
                    style={{
                      ...s.metrics,
                      gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : s.metrics.gridTemplateColumns,
                    }}
                  >
                    <p style={s.metric}><span>Chain</span><strong>{swarm.chain}</strong></p>
                    <p style={s.metric}><span>Positions</span><strong>{swarm.positions}</strong></p>
                    <p style={s.metric}><span>PnL</span><strong>{swarm.pnl}</strong></p>
                    <p style={s.metric}><span>24h Yield</span><strong>{swarm.yield24h}</strong></p>
                    <p style={s.metric}><span>Next Cycle</span><strong>{swarm.nextCycle}</strong></p>
                  </div>
                  <div style={s.swarmActions}>
                    <button style={s.actionGhost}>Open</button>
                    <button style={s.actionGhost}>Policies</button>
                    <button style={s.actionPrimary}>Run Cycle</button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside style={s.sideCol}>
            <article style={s.sidePanel}>
              <h2 style={s.sideTitle}>Live Activity</h2>
              <div style={s.timeline}>
                {EVENTS.map((event) => (
                  <div key={event.time + event.text} style={s.timelineItem}>
                    <span style={s.timelineTime}>{event.time}</span>
                    <p style={s.timelineText}>{event.text}</p>
                  </div>
                ))}
              </div>
            </article>

            <article style={s.sidePanel}>
              <h2 style={s.sideTitle}>Control Center</h2>
              <div style={s.controlGrid}>
                <button style={s.controlBtn}>Rotate Session Keys</button>
                <button style={s.controlBtn}>Adjust Gas Policy</button>
                <button style={s.controlBtn}>Export Swarm Logs</button>
                <button style={s.controlBtn}>Risk Guard Settings</button>
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100svh",
    background: "#0b0b0e",
    color: "#f5f4f9",
    position: "relative",
    overflow: "hidden",
    padding: 20,
  },
  shell: {
    width: "min(1440px, 100%)",
    margin: "0 auto",
  },
  orbA: {
    position: "fixed",
    width: 440,
    height: 440,
    borderRadius: "50%",
    top: -180,
    left: -120,
    background: "radial-gradient(circle, rgba(124,58,237,0.25), transparent 70%)",
    pointerEvents: "none",
  },
  orbB: {
    position: "fixed",
    width: 420,
    height: 420,
    borderRadius: "50%",
    right: -140,
    bottom: -180,
    background: "radial-gradient(circle, rgba(167,139,250,0.2), transparent 70%)",
    pointerEvents: "none",
  },
  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(16,15,24,0.78)",
    backdropFilter: "blur(14px)",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textDecoration: "none",
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 9,
    border: "1px solid rgba(124,58,237,0.45)",
    background: "rgba(124,58,237,0.16)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    fontSize: 13,
    color: "#c4b5fd",
    textDecoration: "none",
    border: "1px solid rgba(124,58,237,0.5)",
    borderRadius: 10,
    padding: "9px 12px",
    background: "rgba(124,58,237,0.2)",
  },
  ctaGhost: {
    fontSize: 13,
    color: "#b8b7c8",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    padding: "9px 12px",
    background: "rgba(255,255,255,0.03)",
  },
  grid: {
    position: "relative",
    zIndex: 1,
    marginTop: 16,
    display: "grid",
    gap: 12,
    gridTemplateColumns: "minmax(0, 1.9fr) minmax(360px, 1fr)",
  },
  kpiRow: {
    gridColumn: "1 / -1",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  },
  kpiCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    background: "rgba(16,15,24,0.7)",
    padding: "12px 14px",
  },
  kpiLabel: {
    margin: 0,
    color: "#9897ad",
    fontSize: 12,
  },
  kpiValue: {
    marginTop: 6,
    display: "block",
    fontSize: 24,
    letterSpacing: "-0.03em",
  },
  mainPanel: {
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    background: "rgba(15,14,22,0.72)",
    padding: 16,
  },
  panelHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterBtn: {
    height: 34,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "0 12px",
    background: "rgba(255,255,255,0.03)",
    color: "#c6c5d8",
    cursor: "pointer",
    fontSize: 12,
  },
  swarmList: {
    marginTop: 14,
    display: "grid",
    gap: 10,
  },
  swarmCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    background: "rgba(18,17,26,0.82)",
    padding: 13,
  },
  swarmTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  swarmId: {
    margin: 0,
    color: "#9c9ab0",
    fontSize: 12,
  },
  swarmTitle: {
    margin: "4px 0 0",
    fontSize: 17,
    lineHeight: 1.25,
  },
  statusPill: {
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  statusActive: {
    color: "#9bf2be",
    borderColor: "rgba(74,222,128,0.4)",
    background: "rgba(74,222,128,0.13)",
  },
  statusMonitoring: {
    color: "#d8ccff",
    borderColor: "rgba(167,139,250,0.4)",
    background: "rgba(124,58,237,0.16)",
  },
  statusReview: {
    color: "#f8c8c8",
    borderColor: "rgba(248,113,113,0.38)",
    background: "rgba(248,113,113,0.12)",
  },
  metrics: {
    marginTop: 12,
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  },
  metric: {
    margin: 0,
    display: "grid",
    gap: 4,
    fontSize: 12,
    color: "#9f9db3",
  },
  swarmActions: {
    marginTop: 12,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  actionGhost: {
    height: 32,
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "#c7c6d7",
    padding: "0 11px",
    cursor: "pointer",
    fontSize: 12,
  },
  actionPrimary: {
    height: 32,
    borderRadius: 9,
    border: "1px solid rgba(124,58,237,0.5)",
    background: "rgba(124,58,237,0.2)",
    color: "#e9e2ff",
    padding: "0 11px",
    cursor: "pointer",
    fontSize: 12,
  },
  sideCol: {
    display: "grid",
    gap: 12,
    alignContent: "start",
  },
  sidePanel: {
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    background: "rgba(15,14,22,0.72)",
    padding: 14,
  },
  sideTitle: {
    margin: 0,
    fontSize: 16,
  },
  timeline: {
    marginTop: 12,
    display: "grid",
    gap: 10,
  },
  timelineItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 11,
    background: "rgba(255,255,255,0.02)",
    padding: 10,
  },
  timelineTime: {
    display: "inline-block",
    fontSize: 11,
    color: "#a99bd1",
    marginBottom: 5,
  },
  timelineText: {
    margin: 0,
    color: "#b6b4c8",
    fontSize: 12,
    lineHeight: 1.45,
  },
  controlGrid: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  controlBtn: {
    textAlign: "left",
    height: 36,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#c7c5d8",
    padding: "0 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  title: {
    margin: 0,
    fontSize: "clamp(24px, 3vw, 34px)",
    letterSpacing: "-0.03em",
  },
  copy: {
    marginTop: 8,
    color: "#9b99b4",
    maxWidth: 740,
    lineHeight: 1.6,
    fontSize: 14,
  },
};
