import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WcSettings {
  orgId: string;
  wcBaseUrl: string;
  wcConsumerKey: string;
  hasSecret: boolean;
  hasWebhookSecret?: boolean;
  tdfApiKey?: string;
  hasTdfWebhookSecret?: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  donorBackupEnabled: boolean;
  donorBackupGoogleDriveEnabled: boolean;
  donorBackupGoogleDriveFolderId: string;
  hasDonorBackupGoogleCredentials: boolean;
  donorBackupB2Enabled: boolean;
  donorBackupB2Endpoint: string;
  donorBackupB2Bucket: string;
  donorBackupB2KeyId: string;
  hasDonorBackupB2ApplicationKey: boolean;
  donorBackupLastRunAt: string | null;
  donorBackupLastStatus: string | null;
  donorBackupLastError: string | null;
  donorBackupLastCount: number | null;
}

export function useWcSettings() {
  return useQuery<WcSettings>({
    queryKey: ["wc-settings"],
    queryFn: async () => {
      const res = await fetch("/api/orgs/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });
}

export function useUpdateWcSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<{
      wcBaseUrl: string;
      wcConsumerKey: string;
      wcConsumerSecret: string;
      wcWebhookSecret: string;
      tdfApiKey: string;
      tdfWebhookSecret: string;
      donorBackupEnabled: boolean;
      donorBackupGoogleDriveEnabled: boolean;
      donorBackupGoogleDriveFolderId: string;
      googleServiceAccountJson: string;
      donorBackupB2Enabled: boolean;
      donorBackupB2Endpoint: string;
      donorBackupB2Bucket: string;
      donorBackupB2KeyId: string;
      b2ApplicationKey: string;
    }>) => {
      const res = await fetch("/api/orgs/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wc-settings"] });
    },
  });
}

export function useManualSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/orgs/sync", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wc-settings"] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["funds"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
    },
  });
}
