"use client";

import Link from "next/link";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSwarms, subscribeToSwarm, type SwarmInfo } from "@/lib/api";
import { AssetLogo } from "@/components/AssetLogo";
import { BRAND_LOGO_URLS, getChainLogoUrl, getTokenLogoUrl } from "@/lib/assetLogos";

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path d="M25 7H13C9.686 7 7 9.686 7 13v1c0 2.21 1.79 4 4 4h10c3.314 0 6 2.686 6 6v1c0 3.314-2.686 6-6 6H9" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M14 4l-4 3 4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 28l4 3-4 3" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type LiveEvent = { time: string; text: string; tag?: string };

function DashboardContent() {
  const searchParams = useSearchParams();
  const [swarms, setSwarms] = useState<SwarmInfo[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [metrics, setMetrics] = useState({ total_return_pct: '0.00', decisions_count: 0, confidence_avg: 0, anchors_count: 0, latest_og_block: 0, storage_used_kb: '0', network_status: 'Connecting' });
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Load swarms from backend
  useEffect(() => {
    getSwarms().then(({ swarms: s }) => setSwarms(s)).catch(() => {});
    const interval = setInterval(() => {
      getSwarms().then(({ swarms: s }) => setSwarms(s)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to SSE — use swarmId from URL or localStorage or 'all'
  useEffect(() => {
    const urlSwarmId = searchParams.get('swarmId');
    const storedSwarmId = typeof window !== 'undefined' ? localStorage.getItem('swarmswap_swarm_id') : null;
    const swarmId = urlSwarmId || storedSwarmId || 'all';

    const unsub = subscribeToSwarm(swarmId, (event) => {
      // Update metrics when METRICS event arrives
      if (event.type === 'METRICS') {
        setMetrics(event.data);
      }

      // Convert backend events to live activity feed entries
      const tag = event.type === 'LOG' ? event.data?.tag : event.type;
      const text = formatEventText(event);
      if (text) {
        setLiveEvents(prev => [{
          time: 'Now',
          text,
          tag
        }, ...prev.slice(0, 19)].map((e, i) => ({ ...e, time: i === 0 ? 'Now' : `${i * 15}s` })));
      }
    });

    unsubRef.current = unsub;
    return () => unsub();
  }, [searchParams]);

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
            <span style={s.brandMark}><LogoIcon /></span>
            SwarmSwap
          </Link>
          <div style={{ ...s.headerActions, gap: isMobile ? 6 : 8 }}>
            <Link href="/app" style={s.ctaGhost}>Onboarding</Link>
            <Link href="/app" style={s.cta}>Create Swarm</Link>
          </div>
        </header>

        <section style={{ ...s.grid, gridTemplateColumns: isTablet ? "1fr" : s.grid.gridTemplateColumns }}>
          <div style={{ ...s.kpiRow, gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : s.kpiRow.gridTemplateColumns }}>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Total Return</p>
              <strong style={{ ...s.kpiValue, color: Number(metrics.total_return_pct) >= 0 ? '#9bf2be' : '#f87171' }}>
                {Number(metrics.total_return_pct) >= 0 ? '+' : ''}{metrics.total_return_pct}%
              </strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Decisions</p>
              <strong style={s.kpiValue}>{metrics.decisions_count}</strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>Confidence</p>
              <strong style={s.kpiValue}>{metrics.confidence_avg}%</strong>
            </article>
            <article style={s.kpiCard}>
              <p style={s.kpiLabel}>0G Anchors</p>
              <strong style={s.kpiValue}>{metrics.anchors_count}</strong>
            </article>
          </div>

          <article style={s.mainPanel}>
            <div style={s.panelHead}>
              <h1 style={s.title}>My Swarms</h1>
              <span style={{ ...s.pill, color: metrics.network_status === 'Live' ? '#9bf2be' : '#f8c8c8', borderColor: metrics.network_status === 'Live' ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)', background: metrics.network_status === 'Live' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)' }}>
                {metrics.network_status}
              </span>
            </div>
            <p style={s.copy}>Autonomous swarms orchestrating Uniswap V3 LP positions via 0G Galileo coordination.</p>
            <div style={s.swarmList}>
              {swarms.length === 0 ? (
                <div style={s.empty}>
                  <p>No active swarms yet.</p>
                  <Link href="/app" style={{ ...s.cta, marginTop: 12, display: 'inline-block' }}>Create your first swarm →</Link>
                </div>
              ) : swarms.map((swarm) => (
                <div key={swarm.swarmId} style={s.swarmCard}>
                  <Link
                    href={`/app/dashboard/${encodeURIComponent(swarm.swarmId)}`}
                    style={{ textDecoration: "none", color: "inherit", display: "block", cursor: "pointer" }}
                  >
                    <div style={s.swarmTop}>
                      <div>
                        <p style={s.swarmId}>Swarm {swarm.swarmId}</p>
                        <h3 style={{ ...s.swarmTitle, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>Token #{swarm.tokenId} ·</span>
                          <AssetLogo src={getTokenLogoUrl("WETH")} alt="" size={18} />
                          <AssetLogo src={getTokenLogoUrl("USDC")} alt="" size={18} />
                          <span>WETH/USDC V3</span>
                        </h3>
                      </div>
                      <span style={{
                        ...s.statusPill,
                        ...(swarm.status === "Stopping" ? s.statusStopping : s.statusActive),
                      }}>{swarm.status}</span>
                    </div>
                    <div style={{ ...s.metrics, gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : s.metrics.gridTemplateColumns }}>
                      <p style={s.metric}>
                        <span>Chain</span>
                        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <AssetLogo src={getChainLogoUrl("Sepolia")} alt="" size={16} />
                          Sepolia
                        </strong>
                      </p>
                      <p style={s.metric}>
                        <span>Coordination</span>
                        <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <AssetLogo src={BRAND_LOGO_URLS.zeroGGalileo} alt="" size={16} />
                          0G Galileo
                        </strong>
                      </p>
                      <p style={s.metric}><span>Return</span><strong>{Number(metrics.total_return_pct) >= 0 ? '+' : ''}{metrics.total_return_pct}%</strong></p>
                      <p style={s.metric}><span>0G Block</span><strong>{metrics.latest_og_block || '—'}</strong></p>
                      <p style={s.metric}><span>Storage</span><strong>{metrics.storage_used_kb} KB</strong></p>
                    </div>
                  </Link>
                  <div style={s.swarmActions}>
                    <a href={`https://sepolia.etherscan.io/address/${swarm.swarmId}`} target="_blank" rel="noreferrer" style={{ ...s.actionGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <AssetLogo src={getChainLogoUrl("Sepolia")} alt="" size={14} />
                      Sepolia
                    </a>
                    <button style={s.actionGhost}>Logs</button>
                    <span style={{ ...s.actionPrimary, cursor: 'default' }}>Engine Running</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside style={s.sideCol}>
            <article style={s.sidePanel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={s.sideTitle}>Live Activity</h2>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{liveEvents.length > 0 ? '● Streaming' : '○ Waiting'}</span>
              </div>
              <div style={s.timeline}>
                {liveEvents.length === 0 ? (
                  <div style={{ ...s.timelineItem, color: '#6b7280', fontSize: 12 }}>Waiting for agent events…</div>
                ) : liveEvents.map((event, i) => (
                  <div key={i} style={s.timelineItem}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={s.timelineTime}>{event.time}</span>
                      {event.tag && <span style={{ ...s.tagPill, ...getTagStyle(event.tag) }}>{event.tag}</span>}
                    </div>
                    <p style={s.timelineText}>{event.text}</p>
                  </div>
                ))}
              </div>
            </article>

            <article style={s.sidePanel}>
              <h2 style={{ ...s.sideTitle, display: "flex", alignItems: "center", gap: 8 }}>
                <AssetLogo src={BRAND_LOGO_URLS.zeroGGalileo} alt="" size={18} />
                0G Network
              </h2>
              <div style={s.controlGrid}>
                <div style={s.statRow}><span>Latest Block</span><strong>{metrics.latest_og_block || '—'}</strong></div>
                <div style={s.statRow}><span>Storage Used</span><strong>{metrics.storage_used_kb} KB</strong></div>
                <div style={s.statRow}><span>Anchors</span><strong>{metrics.anchors_count}</strong></div>
                <div style={s.statRow}><span>Network</span><strong style={{ color: metrics.network_status === 'Live' ? '#9bf2be' : '#f87171' }}>{metrics.network_status}</strong></div>
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function formatEventText(event: any): string {
  const d = event.data || {};
  switch (event.type) {
    case 'LOG': return d.message || '';
    case 'OBSERVE': return `ETH/USDC mainnet tick: ${d.real_tick}`;
    case 'CONSENSUS': return `Consensus: ${d.action} | ${d.quorum} quorum`;
    case 'EXECUTED': return `Swap confirmed: ${d.swap} · ${d.tx_hash?.slice(0, 10)}…`;
    case 'ANCHORED': return `State anchored to 0G Galileo · trades: ${d.total_trades}`;
    case 'ERROR': return `Error: ${d.message?.slice(0, 80)}`;
    case 'LOOP_STOP_REQUESTED': return 'Stop requested — engine finishing current cycle…';
    case 'LOOP_STOPPED': return `Engine stopped · token ${d.token_id ?? '?'}`;
    case 'ANCHOR': return `${d.event_type}: ${d.description}`;
    default: return '';
  }
}

function getTagStyle(tag: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    ANALYZER: { background: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' },
    SENTINEL: { background: 'rgba(234,179,8,0.15)', color: '#fde68a', borderColor: 'rgba(234,179,8,0.3)' },
    MEMORY: { background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', borderColor: 'rgba(139,92,246,0.3)' },
    COMPUTE: { background: 'rgba(6,182,212,0.15)', color: '#67e8f9', borderColor: 'rgba(6,182,212,0.3)' },
    EXECUTOR: { background: 'rgba(249,115,22,0.15)', color: '#fdba74', borderColor: 'rgba(249,115,22,0.3)' },
    SYSTEM: { background: 'rgba(107,114,128,0.15)', color: '#d1d5db', borderColor: 'rgba(107,114,128,0.3)' },
  };
  return map[tag] || { background: 'rgba(255,255,255,0.05)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.1)' };
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100svh", background: "#0b0b0e", color: "#f5f4f9", position: "relative", overflow: "hidden", padding: 20 },
  shell: { width: "min(1440px, 100%)", margin: "0 auto" },
  orbA: { position: "fixed", width: 440, height: 440, borderRadius: "50%", top: -180, left: -120, background: "radial-gradient(circle, rgba(124,58,237,0.25), transparent 70%)", pointerEvents: "none" },
  orbB: { position: "fixed", width: 420, height: 420, borderRadius: "50%", right: -140, bottom: -180, background: "radial-gradient(circle, rgba(167,139,250,0.2), transparent 70%)", pointerEvents: "none" },
  header: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px", background: "rgba(16,15,24,0.78)", backdropFilter: "blur(14px)" },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  brand: { display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", textDecoration: "none" },
  brandMark: { width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(124,58,237,0.45)", background: "rgba(124,58,237,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  cta: { fontSize: 13, color: "#c4b5fd", textDecoration: "none", border: "1px solid rgba(124,58,237,0.5)", borderRadius: 10, padding: "9px 12px", background: "rgba(124,58,237,0.2)" },
  ctaGhost: { fontSize: 13, color: "#b8b7c8", textDecoration: "none", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "9px 12px", background: "rgba(255,255,255,0.03)" },
  pill: { fontSize: 11, borderRadius: 999, padding: "4px 8px", border: "1px solid", whiteSpace: "nowrap" as const },
  grid: { position: "relative", zIndex: 1, marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1.9fr) minmax(360px, 1fr)" },
  kpiRow: { gridColumn: "1 / -1", display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
  kpiCard: { border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, background: "rgba(16,15,24,0.7)", padding: "12px 14px" },
  kpiLabel: { margin: 0, color: "#9897ad", fontSize: 12 },
  kpiValue: { marginTop: 6, display: "block", fontSize: 24, letterSpacing: "-0.03em" },
  mainPanel: { border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, background: "rgba(15,14,22,0.72)", padding: 16 },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  swarmList: { marginTop: 14, display: "grid", gap: 10 },
  swarmCard: { border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, background: "rgba(18,17,26,0.82)", padding: 13 },
  swarmTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  swarmId: { margin: 0, color: "#9c9ab0", fontSize: 12 },
  swarmTitle: { margin: "4px 0 0", fontSize: 17, lineHeight: 1.25 },
  statusPill: { borderRadius: 999, padding: "5px 9px", fontSize: 11, border: "1px solid transparent", whiteSpace: "nowrap" as const },
  statusActive: { color: "#9bf2be", borderColor: "rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.13)" },
  statusStopping: { color: "#fde68a", borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.12)" },
  metrics: { marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" },
  metric: { margin: 0, display: "grid", gap: 4, fontSize: 12, color: "#9f9db3" },
  swarmActions: { marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" as const },
  actionGhost: { height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", color: "#c7c6d7", padding: "0 11px", cursor: "pointer", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" },
  actionPrimary: { height: 32, borderRadius: 9, border: "1px solid rgba(124,58,237,0.5)", background: "rgba(124,58,237,0.2)", color: "#e9e2ff", padding: "0 11px", fontSize: 12, display: "inline-flex", alignItems: "center" },
  sideCol: { display: "grid", gap: 12, alignContent: "start" },
  sidePanel: { border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, background: "rgba(15,14,22,0.72)", padding: 14 },
  sideTitle: { margin: 0, fontSize: 16 },
  timeline: { marginTop: 12, display: "grid", gap: 8, maxHeight: 380, overflowY: "auto" as const },
  timelineItem: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 11, background: "rgba(255,255,255,0.02)", padding: 10 },
  timelineTime: { display: "inline-block", fontSize: 11, color: "#a99bd1", marginBottom: 2 },
  timelineText: { margin: 0, color: "#b6b4c8", fontSize: 12, lineHeight: 1.45 },
  tagPill: { fontSize: 10, borderRadius: 4, padding: "1px 5px", border: "1px solid" },
  controlGrid: { marginTop: 12, display: "grid", gap: 6 },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12, color: "#9ca3af" },
  empty: { textAlign: "center" as const, padding: "40px 0", color: "#6b7280", fontSize: 14 },
  title: { margin: 0, fontSize: "clamp(24px, 3vw, 34px)", letterSpacing: "-0.03em" },
  copy: { marginTop: 8, color: "#9b99b4", maxWidth: 740, lineHeight: 1.6, fontSize: 14 },
};
