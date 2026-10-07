"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWcSettings, useUpdateWcSettings } from "@/hooks/use-sync";
import { AlertCircle, CheckCircle2, Cloud, HardDrive, Loader2, Play, Save, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type BackupConfig = {
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
};

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${checked ? "bg-primary after:translate-x-5" : "bg-input"}`} />
      <span className="sr-only">{label}</span>
    </label>
  );
}

const emptyConfig: BackupConfig = {
  donorBackupEnabled: false,
  donorBackupGoogleDriveEnabled: false,
  donorBackupGoogleDriveFolderId: "",
  hasDonorBackupGoogleCredentials: false,
  donorBackupB2Enabled: false,
  donorBackupB2Endpoint: "",
  donorBackupB2Bucket: "",
  donorBackupB2KeyId: "",
  hasDonorBackupB2ApplicationKey: false,
  donorBackupLastRunAt: null,
  donorBackupLastStatus: null,
  donorBackupLastError: null,
  donorBackupLastCount: null,
};

export function DonorBackupSettings() {
  const { data, isLoading } = useWcSettings();
  const update = useUpdateWcSettings();
  const [config, setConfig] = useState<BackupConfig>(emptyConfig);
  const [googleServiceJson, setGoogleServiceJson] = useState("");
  const [b2ApplicationKey, setB2ApplicationKey] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    const frame = window.requestAnimationFrame(() => setConfig({
      donorBackupEnabled: data.donorBackupEnabled,
      donorBackupGoogleDriveEnabled: data.donorBackupGoogleDriveEnabled,
      donorBackupGoogleDriveFolderId: data.donorBackupGoogleDriveFolderId,
      hasDonorBackupGoogleCredentials: data.hasDonorBackupGoogleCredentials,
      donorBackupB2Enabled: data.donorBackupB2Enabled,
      donorBackupB2Endpoint: data.donorBackupB2Endpoint,
      donorBackupB2Bucket: data.donorBackupB2Bucket,
      donorBackupB2KeyId: data.donorBackupB2KeyId,
      hasDonorBackupB2ApplicationKey: data.hasDonorBackupB2ApplicationKey,
      donorBackupLastRunAt: data.donorBackupLastRunAt,
      donorBackupLastStatus: data.donorBackupLastStatus,
      donorBackupLastError: data.donorBackupLastError,
      donorBackupLastCount: data.donorBackupLastCount,
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [data]);

  if (isLoading) return <Skeleton className="h-130 w-full rounded-2xl" />;

  const persistConfig = async () => {
    await update.mutateAsync({
        donorBackupEnabled: config.donorBackupEnabled,
        donorBackupGoogleDriveEnabled: config.donorBackupGoogleDriveEnabled,
        donorBackupGoogleDriveFolderId: config.donorBackupGoogleDriveFolderId,
        donorBackupB2Enabled: config.donorBackupB2Enabled,
        donorBackupB2Endpoint: config.donorBackupB2Endpoint,
        donorBackupB2Bucket: config.donorBackupB2Bucket,
        donorBackupB2KeyId: config.donorBackupB2KeyId,
        googleServiceAccountJson: googleServiceJson,
        b2ApplicationKey,
      });
      setGoogleServiceJson("");
      setB2ApplicationKey("");
  };

  const save = async () => {
    try {
      await persistConfig();
      toast.success("Backup settings saved securely");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save backup settings");
    }
  };

  const runBackupNow = async () => {
    setIsRunning(true);
    try {
      await persistConfig();
      const response = await fetch("/api/orgs/backup/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Backup failed");
      if (!result.success) toast.warning(`Partial backup: ${result.uploadedTo.join(", ") || "no provider succeeded"}. ${result.error}`);
      else toast.success(`Backup completed for ${result.donorCount} donors`);
      await update.mutateAsync({});
      await update.mutateAsync({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup failed");
    } finally {
      setIsRunning(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    try {
      await persistConfig();
      const response = await fetch("/api/orgs/backup/test", { method: "POST" });
      const result = await response.json();
      if (!response.ok && !result.providers) throw new Error(result.error || "Provider test failed");
      const failed = result.providers?.filter((provider: { success: boolean }) => !provider.success) ?? [];
      if (failed.length) throw new Error(failed.map((provider: { provider: string; error?: string }) => `${provider.provider}: ${provider.error || "failed"}`).join("; "));
      toast.success(`Connection verified: ${result.providers.map((provider: { provider: string }) => provider.provider).join(" and ")}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provider test failed");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="border-none bg-white shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl font-bold">Automatic Donor Backups</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Daily full donor CSV and Excel snapshots at 11:00 PM Bangladesh time. Both enabled providers receive the same files.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
            <Label htmlFor="backup-enabled" className="text-sm font-medium">Enable daily backup</Label>
            <Toggle id="backup-enabled" label="Enable daily backup" checked={config.donorBackupEnabled} onChange={(checked) => setConfig((current) => ({ ...current, donorBackupEnabled: checked }))} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2"><Cloud className="size-5 text-primary" /><h3 className="font-semibold">Google Drive</h3></div>
              <Toggle id="drive-enabled" label="Enable Google Drive backup" checked={config.donorBackupGoogleDriveEnabled} onChange={(checked) => setConfig((current) => ({ ...current, donorBackupGoogleDriveEnabled: checked }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="drive-folder">Destination folder ID</Label><Input id="drive-folder" value={config.donorBackupGoogleDriveFolderId} onChange={(event) => setConfig((current) => ({ ...current, donorBackupGoogleDriveFolderId: event.target.value }))} placeholder="Google Drive folder ID" /></div>
            <div className="space-y-2"><Label htmlFor="drive-service-account">Service account JSON</Label><textarea id="drive-service-account" value={googleServiceJson} onChange={(event) => setGoogleServiceJson(event.target.value)} placeholder={config.hasDonorBackupGoogleCredentials ? "Saved securely — enter a new JSON key only to replace it" : "Paste the complete service-account JSON"} rows={4} className="w-full resize-y rounded-xl border border-input bg-muted/40 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            {config.hasDonorBackupGoogleCredentials && <p className="text-xs text-emerald-700">✓ Service account configured; secret is stored encrypted and never returned to the browser.</p>}
          </div>

          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2"><HardDrive className="size-5 text-primary" /><h3 className="font-semibold">Backblaze B2 (S3-compatible)</h3></div>
              <Toggle id="b2-enabled" label="Enable Backblaze B2 backup" checked={config.donorBackupB2Enabled} onChange={(checked) => setConfig((current) => ({ ...current, donorBackupB2Enabled: checked }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="b2-endpoint">S3 endpoint</Label><Input id="b2-endpoint" value={config.donorBackupB2Endpoint} onChange={(event) => setConfig((current) => ({ ...current, donorBackupB2Endpoint: event.target.value }))} placeholder="https://s3.us-west-004.backblazeb2.com" /></div>
            <div className="space-y-2"><Label htmlFor="b2-bucket">Bucket name</Label><Input id="b2-bucket" value={config.donorBackupB2Bucket} onChange={(event) => setConfig((current) => ({ ...current, donorBackupB2Bucket: event.target.value }))} placeholder="private donor-backup bucket" /></div>
            <div className="space-y-2"><Label htmlFor="b2-key-id">Application key ID</Label><Input id="b2-key-id" value={config.donorBackupB2KeyId} onChange={(event) => setConfig((current) => ({ ...current, donorBackupB2KeyId: event.target.value }))} placeholder="B2 application key ID" /></div>
            <div className="space-y-2"><Label htmlFor="b2-application-key">Application key</Label><Input id="b2-application-key" type="password" value={b2ApplicationKey} onChange={(event) => setB2ApplicationKey(event.target.value)} placeholder={config.hasDonorBackupB2ApplicationKey ? "Saved securely — enter a new key only to replace it" : "B2 application key"} /></div>
            {config.hasDonorBackupB2ApplicationKey && <p className="text-xs text-emerald-700">✓ B2 key configured; secret is stored encrypted and never returned to the browser.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Vercel Hobby runs a cron once per day, but not at an exact minute. The 11:00 PM Bangladesh schedule may start any time from 11:00–11:59 PM. Files are per-organization and the same-day backup replaces the same named CSV/XLSX files.
        </div>

        {config.donorBackupLastRunAt && <div className="flex flex-wrap items-center gap-2 text-sm">
          {config.donorBackupLastStatus === "SUCCESS" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertCircle className="size-4 text-destructive" />}
          <span>Last run: {new Date(config.donorBackupLastRunAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</span>
          {config.donorBackupLastCount !== null && <Badge variant="outline">{config.donorBackupLastCount} donors</Badge>}
          {config.donorBackupLastError && <span className="w-full text-xs text-destructive">{config.donorBackupLastError}</span>}
        </div>}
      </CardContent>

      <CardFooter className="flex flex-col-reverse items-stretch gap-2 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" disabled={update.isPending || isRunning || isTesting} onClick={testConnection}>
          {isTesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PlugZap className="mr-2 size-4" />}
          Test connection
        </Button>
        <Button type="button" variant="outline" disabled={(!config.donorBackupGoogleDriveEnabled && !config.donorBackupB2Enabled) || update.isPending || isRunning || isTesting} onClick={runBackupNow}>
          {isRunning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          Run backup now
        </Button>
        </div>
        <Button type="button" disabled={update.isPending} onClick={save}>
          {update.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save backup settings
        </Button>
      </CardFooter>
    </Card>
  );
}
