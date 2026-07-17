import type { Metadata, Viewport } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ExitPrompt } from "@/components/pwa/exit-prompt";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | TDF Donation Dashboard",
    default: "TDF Donation Dashboard",
  },
  description:
    "Multi-tenant donation analytics platform. Track funds, donors, and donations from WooCommerce in real time.",
  keywords: ["donations", "nonprofit", "WooCommerce", "analytics", "fundraising"],
  authors: [{ name: "TDF Donation Dashboard" }],
  robots: { index: false, follow: false }, // Private SaaS — no indexing
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TDF Dashboard",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", inter.variable, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ServiceWorkerRegister />
        <InstallPrompt />
        <ExitPrompt />
        <QueryProvider>
          <TooltipProvider>
            {children}
            <Toaster position="top-right" />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
