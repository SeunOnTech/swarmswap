'use client';

import React from 'react';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { defineChain } from 'viem';

const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo',
  nativeCurrency: { name: '0G', symbol: 'A0GI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
});

const config = getDefaultConfig({
  appName: 'SwarmSwap',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Optional for demo
  chains: [zeroGGalileo],
  transports: {
    [zeroGGalileo.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#3b82f6' })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
