"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// React Query Provider
// Creates a new QueryClient per-request to avoid shared state between users.
// ─────────────────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data fresh for 30 seconds before background refetch
        staleTime: 30 * 1000,
        // Cache for 5 minutes after component unmounts
        gcTime: 5 * 60 * 1000,
        // Retry once on failure
        retry: 1,
        // Don't refetch on window focus in dev (too noisy)
        refetchOnWindowFocus: process.env.NODE_ENV === "production",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always create a new client
    return makeQueryClient();
  }
  // Browser: create once
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
