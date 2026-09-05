"use client";

import { useState, useEffect } from "react";
import { useWcSettings, useUpdateWcSettings, useManualSync } from "@/hooks/use-sync";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

export function TdfIntegration() {
  const { data: settings, isLoading } = useWcSettings();
  const updateSettings = useUpdateWcSettings();

  const [formData, setFormData] = useState({
    tdfApiKey: "",
    tdfWebhookSecret: "",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        tdfApiKey: settings.tdfApiKey || "",
        tdfWebhookSecret: "", // Never populate secret
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(formData);
  };

  const handleSync = () => {
    manualSync.mutate();
  };

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full rounded-2xl" />;
  }

  const isConnected = !!settings?.tdfApiKey && !!settings?.hasTdfWebhookSecret;

  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-foreground">Custom Donation Plugin API</CardTitle>
            <CardDescription>
              Connect your new custom WordPress plugin to receive real-time donation webhooks and sync historical data.
            </CardDescription>
          </div>
          {isConnected ? (
            <Badge className="bg-[#E6EFEA] text-[#0D472B] hover:bg-[#E6EFEA] flex items-center gap-1.5 px-3 py-1">
              <CheckCircle2 className="size-3.5" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 flex items-center gap-1.5 px-3 py-1">
              <AlertCircle className="size-3.5" /> Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tdfApiKey">REST API Key</Label>
            <Input 
              id="tdfApiKey" 
              placeholder="Enter your X-TDF-Api-Key" 
              value={formData.tdfApiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, tdfApiKey: e.target.value }))}
              className="bg-muted/50 border-none rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Used to fetch historical donations via the custom REST endpoint.</p>
          </div>

          <div className="pt-4 border-t">
            <h3 className="text-sm font-semibold mb-3">Webhook Configuration</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter the Webhook Secret from your WordPress plugin settings to verify real-time incoming donations.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Webhook Delivery URL</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly
                    value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/tdf/${settings?.orgId}` : ''}
                    className="bg-muted/50 border-none rounded-xl font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/tdf/${settings?.orgId}`);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tdfWebhookSecret">Webhook Secret</Label>
                <Input 
                  id="tdfWebhookSecret" 
                  type="password"
                  placeholder={settings?.hasTdfWebhookSecret ? "••••••••••••••••" : "Enter the webhook secret..."} 
                  value={formData.tdfWebhookSecret}
                  onChange={(e) => setFormData(prev => ({ ...prev, tdfWebhookSecret: e.target.value }))}
                  className="bg-muted/50 border-none rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>

        {isConnected && (
          <div className="bg-muted/30 p-4 rounded-xl flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Manual Data Sync</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Last synced: {settings.lastSyncedAt ? format(new Date(settings.lastSyncedAt), "MMM dd, yyyy HH:mm a") : "Never"}
              </span>
            </div>
            <Button 
              onClick={handleSync} 
              disabled={manualSync.isPending}
              className="bg-[#0D472B] hover:bg-[#051C10] text-white rounded-xl shadow-sm"
            >
              {manualSync.isPending ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 size-4" />
                  Sync Now
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="pt-2 pb-6 px-6">
        <Button 
          onClick={handleSave} 
          disabled={updateSettings.isPending}
          className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-sm"
        >
          {updateSettings.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </CardFooter>
    </Card>
  );
}
