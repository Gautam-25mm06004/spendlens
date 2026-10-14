"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const res = await fetch("/api/receipts/review");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{
        items: { receipt: { id: string; merchant: string | null; fileName: string }; review: { fieldPath: string } }[];
      }>;
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const items = data?.items ?? [];
  const byReceipt = new Map<string, typeof items>();
  for (const item of items) {
    const id = item.receipt.id;
    if (!byReceipt.has(id)) byReceipt.set(id, []);
    byReceipt.get(id)!.push(item);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Review queue</h1>
      {byReceipt.size === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nothing needs review. All extractions are confirmed or failed.
          </CardContent>
        </Card>
      ) : (
        [...byReceipt.entries()].map(([id, rows]) => (
          <Card key={id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {rows[0]?.receipt.merchant ?? rows[0]?.receipt.fileName}
              </CardTitle>
              <Badge variant="warning">needs review</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Fields: {rows.map((r) => r.review.fieldPath).join(", ")}
              </p>
              <Button asChild size="sm">
                <Link href={`/receipts/${id}`}>Review & confirm</Link>
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
