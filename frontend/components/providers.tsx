"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ToastRegion } from "./toast-region";
import { toast } from "@/lib/toasts";
import { useState, type ReactNode } from "react";
import { CouncilSession } from "./session";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onSuccess: (data, _variables, _context, mutation) => {
            const result = data as
              { verification?: { passed?: boolean } } | undefined;
            if (result?.verification?.passed === false)
              toast(
                "The evidence needs attention. Review the checks below.",
                "info",
              );
            else
              toast(
                typeof mutation.options.meta?.successMessage === "string"
                  ? mutation.options.meta.successMessage
                  : "Request completed. The latest result is shown on the page.",
              );
          },
          onError: (error) =>
            toast(
              error instanceof Error
                ? error.message
                : "The request could not be completed. Please retry.",
              "error",
            ),
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 15 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CouncilSession>{children}</CouncilSession>
      </AuthProvider>
      <ToastRegion />
    </QueryClientProvider>
  );
}
