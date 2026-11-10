"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.getHealth({ signal }),
    refetchInterval: 30_000,
  });
export const useRiver = () =>
  useQuery({
    queryKey: ["river"],
    queryFn: ({ signal }) => api.getRiverStatus({ signal }),
    refetchInterval: 5_000,
  });
export const useBounties = () =>
  useQuery({
    queryKey: ["bounties"],
    queryFn: ({ signal }) => api.getBounties({}, { signal }),
    refetchInterval: 5_000,
  });
export const usePayouts = () =>
  useQuery({
    queryKey: ["payouts"],
    queryFn: ({ signal }) => api.getPayouts({}, { signal }),
    refetchInterval: 5_000,
  });
export const useDonations = () =>
  useQuery({
    queryKey: ["donations"],
    queryFn: ({ signal }) => api.getDonations({}, { signal }),
    refetchInterval: 5_000,
  });
