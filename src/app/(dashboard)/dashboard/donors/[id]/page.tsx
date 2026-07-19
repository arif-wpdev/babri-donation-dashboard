"use client";

import { useParams } from "next/navigation";
import { useDonor } from "@/hooks/use-donors";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { DonorTransactionsTable } from "@/components/reporting/donor-transactions-table";
import { ArrowLeft, CreditCard, Banknote, Calendar, History } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

export default function DonorProfilePage() {
  const params = useParams();
  const donorId = params.id as string;
  
  // Fetch donor details
  const { data: donorData, isLoading: isLoadingDonor } = useDonor(donorId);
  const donor = donorData?.data;

  const firstDonationDateStr = donor?.donations?.[0]?.wcDatePaid || donor?.donations?.[0]?.wcDateCreated || donor?.wcDateCreated;
  const firstDonationDate = firstDonationDateStr ? new Date(firstDonationDateStr) : null;
  const lastDonationDate = donor?.lastDonationAt ? new Date(donor.lastDonationAt) : null;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-4">
        <Link 
          href="/dashboard/donors" 
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Directory
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            {isLoadingDonor ? (
              <Skeleton className="size-16 rounded-full" />
            ) : (
              <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl shadow-sm uppercase">
                {donor?.firstName?.[0] || donor?.email?.[0] || "?"}
              </div>
            )}
            
            <div>
              {isLoadingDonor ? (
                <Skeleton className="h-8 w-[250px] mb-2" />
              ) : (
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  {donor?.firstName || donor?.lastName ? `${donor.firstName || ""} ${donor.lastName || ""}`.trim() : (donor?.email || donor?.phone || donor?.normalizedPhone || "Anonymous Donor")}
                </h2>
              )}
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span>{donor?.email || "No Email"}</span>
                <span>•</span>
                <span>{donor?.phone || donor?.normalizedPhone || "No Phone"}</span>
              </div>
            </div>
          </div>
          
          <div className="text-xs bg-muted px-3 py-1.5 rounded-full text-muted-foreground font-mono">
            WC ID: {donor?.wcCustomerId || "Guest"}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <Card className="border-none shadow-sm rounded-2xl bg-gradient-to-br from-[#0D472B] to-[#0a3822] text-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white/80">Lifetime Donation</span>
                <span className="text-2xl font-bold">
                  {isLoadingDonor ? <Skeleton className="h-8 w-24 bg-white/20" /> : `৳${Number(donor?.totalSpent || 0).toLocaleString()}`}
                </span>
              </div>
              <div className="size-10 rounded-full bg-white/10 flex items-center justify-center">
                <Banknote className="size-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Donation Count</span>
                <span className="text-2xl font-bold text-foreground">
                  {isLoadingDonor ? <Skeleton className="h-8 w-16" /> : (donor?.ordersCount || 0).toLocaleString()}
                </span>
              </div>
              <div className="size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center">
                <CreditCard className="size-5 text-[#0D472B]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">First Donation</span>
                <span className="text-xl font-bold text-foreground">
                  {isLoadingDonor ? <Skeleton className="h-8 w-24" /> : firstDonationDate ? format(firstDonationDate, "MMM dd, yyyy") : "-"}
                </span>
              </div>
              <div className="size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center">
                <Calendar className="size-5 text-[#0D472B]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Last Donation</span>
                <span className="text-xl font-bold text-foreground">
                  {isLoadingDonor ? <Skeleton className="h-8 w-24" /> : lastDonationDate ? format(lastDonationDate, "MMM dd, yyyy") : "-"}
                </span>
              </div>
              <div className="size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center">
                <History className="size-5 text-[#0D472B]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-bold text-foreground">Donation History</h3>
        <DonorTransactionsTable donorId={donorId} />
      </div>
    </div>
  );
}
