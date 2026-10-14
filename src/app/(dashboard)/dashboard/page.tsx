"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const res = await fetch("/api/receipts");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        receipts: {
          status: string;
          total: string | null;
          currency: string | null;
          category: string | null;
          merchant: string | null;
        }[];
      }>;
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const confirmed = (data?.receipts ?? []).filter((r) => r.status === "confirmed");
  const byCategory = new Map<string, { total: number; currency: string }>();
  const byMerchant = new Map<string, { total: number; currency: string }>();

  for (const r of confirmed) {
    const amount = Number(r.total ?? 0);
    const currency = r.currency ?? "USD";
    const cat = r.category ?? "Uncategorized";
    const merch = r.merchant ?? "Unknown";
    const catKey = `${cat}|${currency}`;
    const merchKey = `${merch}|${currency}`;
    byCategory.set(catKey, {
      total: (byCategory.get(catKey)?.total ?? 0) + amount,
      currency,
    });
    byMerchant.set(merchKey, {
      total: (byMerchant.get(merchKey)?.total ?? 0) + amount,
      currency,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          {confirmed.length} confirmed receipts · amounts shown per native currency
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
            <CardDescription>Grouped by receipt category</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {byCategory.size === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed receipts yet.</p>
            ) : (
              [...byCategory.entries()].map(([key, v]) => {
                const [category] = key.split("|");
                return (
                  <div key={key} className="flex justify-between text-sm">
                    <span>{category}</span>
                    <span className="font-medium">{formatCurrency(v.total, v.currency)}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By merchant</CardTitle>
            <CardDescription>Top merchants by spend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {byMerchant.size === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed receipts yet.</p>
            ) : (
              [...byMerchant.entries()]
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 10)
                .map(([key, v]) => {
                  const [merchant] = key.split("|");
                  return (
                    <div key={key} className="flex justify-between text-sm">
                      <span>{merchant}</span>
                      <span className="font-medium">{formatCurrency(v.total, v.currency)}</span>
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
