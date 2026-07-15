"use client";

import { WooCommerceIntegration } from "@/components/settings/woocommerce-integration";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your organization's integrations and preferences.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <WooCommerceIntegration />
      </div>
    </div>
  );
}
