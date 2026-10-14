"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

type ReceiptRow = {
  id: string;
  fileName: string;
  status: string;
  merchant: string | null;
  total: string | null;
  currency: string | null;
  receiptDate: string | null;
};

function statusVariant(status: string) {
  if (status === "confirmed") return "success" as const;
  if (status === "needs_review") return "warning" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

export default function ReceiptsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const res = await fetch("/api/receipts");
      if (!res.ok) throw new Error("Failed to load receipts");
      return res.json() as Promise<{ receipts: ReceiptRow[] }>;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Could not load receipts.</p>;
  }

  const receipts = data?.receipts ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Receipts</h1>
      {receipts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No receipts yet. <Link href="/upload" className="text-primary underline">Upload one</Link>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => (
            <Link key={r.id} href={`/receipts/${r.id}`}>
              <Card className="transition hover:bg-accent/40">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div>
                    <CardTitle className="text-base">
                      {r.merchant ?? r.fileName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {r.receiptDate ?? "—"} · {formatCurrency(r.total, r.currency ?? "USD")}
                    </p>
                  </div>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
