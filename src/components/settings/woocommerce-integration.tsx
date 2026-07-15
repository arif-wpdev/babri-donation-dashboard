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

export function WooCommerceIntegration() {
  const { data: settings, isLoading } = useWcSettings();
  const updateSettings = useUpdateWcSettings();
  const manualSync = useManualSync();

  const [formData, setFormData] = useState({
    wcBaseUrl: "",
    wcConsumerKey: "",
    wcConsumerSecret: "",
    wcWebhookSecret: "",
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        wcBaseUrl: settings.wcBaseUrl || "",
        wcConsumerKey: settings.wcConsumerKey || "",
        wcConsumerSecret: "", // Never populate secret
        wcWebhookSecret: "", // Never populate secret
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

  const isConnected = !!settings?.wcBaseUrl && !!settings?.hasSecret;

  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold text-foreground">WooCommerce Connection</CardTitle>
            <CardDescription>
              Connect your WooCommerce store to automatically sync funds, donors, and donations.
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
            <Label htmlFor="wcBaseUrl">Store URL</Label>
            <Input 
              id="wcBaseUrl" 
              placeholder="https://yourstore.com" 
              value={formData.wcBaseUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, wcBaseUrl: e.target.value }))}
              className="bg-muted/50 border-none rounded-xl"
            />
            <p className="text-xs text-muted-foreground">The full URL to your WooCommerce homepage.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="wcConsumerKey">Consumer Key</Label>
              <Input 
                id="wcConsumerKey" 
                placeholder="ck_xxxxxxxxxxxxxxxxxxxx" 
                value={formData.wcConsumerKey}
                onChange={(e) => setFormData(prev => ({ ...prev, wcConsumerKey: e.target.value }))}
                className="bg-muted/50 border-none rounded-xl"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="wcConsumerSecret">Consumer Secret</Label>
              <Input 
                id="wcConsumerSecret" 
                type="password"
                placeholder={settings?.hasSecret ? "••••••••••••••••" : "cs_xxxxxxxxxxxxxxxxxxxx"} 
                value={formData.wcConsumerSecret}
                onChange={(e) => setFormData(prev => ({ ...prev, wcConsumerSecret: e.target.value }))}
                className="bg-muted/50 border-none rounded-xl"
              />
              {settings?.hasSecret && (
                <p className="text-xs text-muted-foreground">Leave blank to keep existing secret.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t">
            <h3 className="text-sm font-semibold mb-3">Automatic Sync (Webhooks)</h3>
            <p className="text-xs text-muted-foreground mb-4">
              To enable automatic syncing, go to your WooCommerce Settings &gt; Advanced &gt; Webhooks. Create a new webhook for "Order Created" and "Order Updated" using the details below.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Webhook Delivery URL</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly
                    value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/woocommerce/${settings?.orgId}` : ''}
                    className="bg-muted/50 border-none rounded-xl font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/woocommerce/${settings?.orgId}`);
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wcWebhookSecret">Webhook Secret</Label>
                <Input 
                  id="wcWebhookSecret" 
                  type="password"
                  placeholder={settings?.hasWebhookSecret ? "••••••••••••••••" : "Enter a strong secret..."} 
                  value={formData.wcWebhookSecret}
                  onChange={(e) => setFormData(prev => ({ ...prev, wcWebhookSecret: e.target.value }))}
                  className="bg-muted/50 border-none rounded-xl"
                />
                <p className="text-xs text-muted-foreground">This matches the "Secret" field in your WooCommerce Webhook settings.</p>
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
