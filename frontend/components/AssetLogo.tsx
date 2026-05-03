"use client";

import type { CSSProperties } from "react";
import { getTokenLogoUrl, parsePoolTokenSymbols } from "@/lib/assetLogos";

type AssetLogoProps = {
  src?: string | null;
  /** Accessible label; use "" for decorative (adjacent text explains). */
  alt: string;
  size?: number;
  style?: CSSProperties;
  /** Default true for round token/chain icons */
  round?: boolean;
};

export function AssetLogo({ src, alt, size = 18, style, round = true }: AssetLogoProps) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
        borderRadius: round ? 9999 : 4,
        ...style,
      }}
    />
  );
}

export function TokenPairLogos({ pool, size = 14 }: { pool: string; size?: number }) {
  const syms = parsePoolTokenSymbols(pool);
  if (syms.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} aria-hidden>
      {syms.map((sym, i) => (
        <AssetLogo key={`${sym}-${i}`} src={getTokenLogoUrl(sym)} alt="" size={size} />
      ))}
    </span>
  );
}
