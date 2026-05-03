"use client";

import { useParams } from "next/navigation";
import LiveIntelligence from "@/components/LiveIntelligence";

export default function SwarmFeedsPage() {
  const params = useParams();
  const raw = params?.swarmId;
  const swarmId = typeof raw === "string" ? decodeURIComponent(raw) : undefined;

  return <LiveIntelligence swarmId={swarmId} />;
}
