"use client";

import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileSpreadsheet, Plus, RotateCcw, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { useAdLedgerActions, useAdSpend } from "@/hooks/use-ad-spend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const money = (value: number) => `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export function AdSpendReport({ dateRange }: { dateRange?: DateRange | null }) {
  const { data, isLoading, isError, error } = useAdSpend(dateRange);
  const actions = useAdLedgerActions();
  const [entryType, setEntryType] = useState<"TOP_UP" | "SPEND">("SPEND");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(dateValue(new Date()));
  const [campaignName, setCampaignName] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");

  const today = dateValue(new Date());
  const yesterday = dateValue(subDays(new Date(), 1));
  const selectedDateRange = dateRange?.from && dateRange?.to
    ? { from: dateValue(dateRange.from), to: dateValue(dateRange.to) }
    : dateRange?.from
      ? { from: dateValue(dateRange.from), to: dateValue(dateRange.from) }
      : null;

  const visibleDaily = useMemo(() => (data?.daily ?? []).filter((item) => {
    if (!selectedDateRange) return item.date === today || item.date === yesterday;
    return item.date >= selectedDateRange.from && item.date <= selectedDateRange.to;
  }), [data?.daily, selectedDateRange?.from, selectedDateRange?.to, today, yesterday]);

  const submitEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await actions.createEntry.mutateAsync({
        type: entryType,
        amount: Number(amount),
        currency: "BDT",
        entryDate,
        campaignName,
        reference,
        note,
      });
      toast.success(entryType === "TOP_UP" ? "Prepaid top-up saved" : "Daily ad spend saved");
      setAmount("");
      setCampaignName("");
      setReference("");
      setNote("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save ledger entry");
    }
  };

  const previewFile = async () => {
    if (!file) return;
    try {
      const result = await actions.importFile.mutateAsync({ file, confirm: false });
      setPreview(result);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not preview file");
    }
  };

  const commitImport = async () => {
    if (!file || !preview?.validCount) return;
    try {
      const result = await actions.importFile.mutateAsync({ file, confirm: true });
      toast.success(`Imported ${result.batch.rowCount} daily spend rows`);
      setPreview(null);
      setFile(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not import file");
    }
  };

  const voidEntry = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    try {
      await actions.voidEntry.mutateAsync({ id: voidTarget.id, reason: voidReason.trim() });
      toast.success("Ledger entry voided; balance recalculated");
      setVoidTarget(null);
      setVoidReason("");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not void entry");
    }
  };

  const downloadTemplate = () => {
    const content = "date,campaign,amount,currency,reference,note\n2026-10-01,Facebook campaign,850,BDT,,";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    link.download = "facebook-ad-spend-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section id="facebook-ads" className="flex scroll-mt-24 flex-col gap-4 lg:gap-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Facebook Ads</h2>
        <p className="mt-1 text-sm text-muted-foreground">Prepaid balance, daily spend and import history · Asia/Dhaka · BDT</p>
      </div>

      {isError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Could not load ad ledger"}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard title="Available balance" value={data?.balance} isLoading={isLoading} prominent />
        <MetricCard title="Spend in selected period" value={data?.periodSpend} isLoading={isLoading} />
        <MetricCard title="Top-ups in selected period" value={data?.periodTopUps} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Daily ad spend</CardTitle>
            <CardDescription>Uses the same time filter as donations above.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-72 w-full" /> : visibleDaily.length ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visibleDaily} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(value) => format(new Date(`${value}T00:00:00`), "d MMM")} />
                    <YAxis tickFormatter={(value) => `৳${Number(value).toLocaleString("en-BD")}`} />
                    <Tooltip formatter={(value) => [money(Number(value)), "Spend"]} labelFormatter={(label) => format(new Date(`${label}T00:00:00`), "d MMM, yy")} />
                    <Bar dataKey="spend" name="Spend" fill="#0d472b" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="flex h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No ad spend recorded for this period.</div>}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Wallet className="size-4" /> Add ledger entry</CardTitle>
            <CardDescription>Record prepaid funds or one day’s spend.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.canManage ? (
              <form onSubmit={submitEntry} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="ad-entry-type">Entry</Label><Select value={entryType} onValueChange={(value) => setEntryType(value as "TOP_UP" | "SPEND")}><SelectTrigger id="ad-entry-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SPEND">Daily spend</SelectItem><SelectItem value="TOP_UP">Prepaid top-up</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="ad-entry-date">Date (Dhaka)</Label><Input id="ad-entry-date" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="ad-entry-amount">Amount (BDT)</Label><Input id="ad-entry-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" /></div>
                {entryType === "SPEND" && <div className="space-y-1.5"><Label htmlFor="ad-entry-campaign">Campaign</Label><Input id="ad-entry-campaign" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Optional campaign name" /></div>}
                <div className="space-y-1.5"><Label htmlFor="ad-entry-reference">Reference</Label><Input id="ad-entry-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Receipt or transaction ID (optional)" /></div>
                <div className="space-y-1.5"><Label htmlFor="ad-entry-note">Note</Label><Input id="ad-entry-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" /></div>
                <Button type="submit" disabled={actions.createEntry.isPending} className="mt-1"><Plus className="mr-2 size-4" />{actions.createEntry.isPending ? "Saving…" : entryType === "TOP_UP" ? "Add top-up" : "Add spend"}</Button>
              </form>
            ) : <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Only organization admins can add or import ledger entries.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-lg">Import daily spend</CardTitle><CardDescription>CSV, XLS or XLSX · preview is required before importing.</CardDescription></div>
          <Button type="button" variant="outline" onClick={downloadTemplate}><Download className="mr-2 size-4" />Download template</Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data?.canManage ? <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} aria-label="Choose ad spend spreadsheet" />
              <Button type="button" variant="outline" disabled={!file || actions.importFile.isPending} onClick={previewFile}><FileSpreadsheet className="mr-2 size-4" />{actions.importFile.isPending ? "Processing…" : "Preview file"}</Button>
            </div>
            {preview && <div className="rounded-xl border p-4">
              {preview.duplicate ? <p role="alert" className="text-sm text-amber-700">This exact file was already imported. Existing rows were not duplicated.</p> : <>
                <p className="text-sm font-medium">{preview.validCount} valid of {preview.totalRows} rows</p>
                {!!preview.invalidRows?.length && <p className="mt-1 text-sm text-destructive">{preview.invalidRows.length} invalid rows; fix the sheet and preview it again.</p>}
                <div className="mt-3 max-h-52 overflow-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Date</TableHead><TableHead>Campaign</TableHead><TableHead>Amount</TableHead><TableHead>Currency</TableHead></TableRow></TableHeader><TableBody>
                    {preview.sampleRows?.map((row: any) => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell>{row.date}</TableCell><TableCell>{row.campaign || "—"}</TableCell><TableCell>{money(Number(row.amount))}</TableCell><TableCell>{row.currency}</TableCell></TableRow>)}
                  </TableBody></Table>
                </div>
                {!!preview.invalidRows?.length && <div className="mt-2 max-h-28 overflow-auto text-xs text-destructive">{preview.invalidRows.slice(0, 8).map((row: any) => <p key={row.rowNumber}>Row {row.rowNumber}: {row.errors.join(", ")}</p>)}</div>}
                <Button type="button" className="mt-3" disabled={!preview.validCount || actions.importFile.isPending} onClick={commitImport}><Upload className="mr-2 size-4" />Import {preview.validCount} rows</Button>
              </>}
            </div>}
          </> : <p className="text-sm text-muted-foreground">Spreadsheet import is available to organization admins.</p>}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader><CardTitle className="text-lg">Recent ledger activity</CardTitle><CardDescription>Voiding an entry keeps its audit history and recalculates the balance.</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-36 w-full" /> : <div className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Campaign / reference</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
              {data?.entries.length ? data.entries.map((entry) => <TableRow key={entry.id} className={entry.status === "VOID" ? "opacity-55" : undefined}>
                <TableCell className="whitespace-nowrap">{format(new Date(`${entry.entryDate.slice(0, 10)}T00:00:00`), "d MMM, yy")}</TableCell>
                <TableCell><Badge variant={entry.type === "TOP_UP" ? "secondary" : "outline"}>{entry.type === "TOP_UP" ? "Top-up" : "Spend"}</Badge></TableCell>
                <TableCell><div>{entry.campaignName || "—"}</div><div className="text-xs text-muted-foreground">{entry.reference || entry.note || ""}</div></TableCell>
                <TableCell>{entry.source === "IMPORT" ? "Excel/CSV" : "Manual"}</TableCell>
                <TableCell className="text-right font-semibold">{money(entry.amount)}</TableCell>
                <TableCell>{entry.status === "VOID" ? <Badge variant="destructive">Voided</Badge> : <Badge variant="secondary">Posted</Badge>}</TableCell>
                <TableCell className="text-right">{data.canManage && entry.status === "POSTED" && <Button size="sm" variant="ghost" onClick={() => setVoidTarget(entry)} aria-label={`Void ${entry.type.toLowerCase()} entry`}>Void</Button>}</TableCell>
              </TableRow>) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No top-ups or spend entries yet.</TableCell></TableRow>}
            </TableBody></Table>
          </div>}
        </CardContent>
      </Card>

      <Dialog open={!!voidTarget} onOpenChange={(open) => { if (!open) { setVoidTarget(null); setVoidReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void ledger entry?</DialogTitle><DialogDescription>This keeps the audit record but excludes the entry from balance and reports. Enter a reason.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="void-reason">Reason</Label><Input id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} maxLength={2000} required /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setVoidTarget(null)} disabled={actions.voidEntry.isPending}>Cancel</Button><Button type="button" variant="destructive" onClick={voidEntry} disabled={!voidReason.trim() || actions.voidEntry.isPending}><RotateCcw className="mr-2 size-4" />Void entry</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MetricCard({ title, value, isLoading, prominent = false }: { title: string; value?: number; isLoading: boolean; prominent?: boolean }) {
  return <Card className={prominent ? "border-primary/20 bg-primary/5" : ""}><CardContent className="p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    {isLoading ? <Skeleton className="mt-2 h-8 w-32" /> : <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{money(value ?? 0)}</div>}
  </CardContent></Card>;
}
