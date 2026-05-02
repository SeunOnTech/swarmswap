import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwarmSwap | Autonomous Liquidity Swarms",
  description: "Deploy agentic LPs that self-coordinate on 0G Storage and execute on Uniswap. No manual rebalancing. Just yield.",
};

import { Web3Provider } from "@/components/providers/Web3Provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
