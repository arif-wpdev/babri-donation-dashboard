"use client";

import { WooCommerceIntegration } from "@/components/settings/woocommerce-integration";
import { TdfIntegration } from "@/components/settings/tdf-integration";
import { DonorBackupSettings } from "@/components/settings/donor-backup-settings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">


      <div className="grid grid-cols-1 gap-6 max-w-4xl">
        <WooCommerceIntegration />
        <TdfIntegration />
        <DonorBackupSettings />
      </div>
    </div>
  );
}
