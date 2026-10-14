"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const res = await fetch(`/api/receipts/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const [fields, setFields] = useState<Record<string, string>>({});

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error("Confirm failed");
    },
    onSuccess: () => {
      toast.success("Receipt confirmed");
      void qc.invalidateQueries({ queryKey: ["receipt", id] });
      void qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: () => toast.error("Could not confirm"),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data?.receipt) return <p>Receipt not found.</p>;

  const r = data.receipt;
  const needsReview = r.status === "needs_review";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{r.merchant ?? r.fileName}</CardTitle>
          <Badge variant={needsReview ? "warning" : "success"}>{r.status}</Badge>
        </CardHeader>
        <CardContent>
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.imageUrl} alt="Receipt" className="max-h-[500px] w-full rounded-md object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">Image unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracted fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["merchant", "date", "currency", "category", "tax", "total"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key}>{key}</Label>
              <Input
                id={key}
                defaultValue={
                  fields[key] ??
                  (key === "date"
                    ? r.receiptDate
                    : key === "total" || key === "tax"
                      ? r[key]
                      : r[key]) ??
                  ""
                }
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!needsReview && r.status === "confirmed"}
              />
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(r.total, r.currency ?? "USD")}
          </p>
          {needsReview && (
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              Confirm corrections
            </Button>
          )}
          {data.lineItems?.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-sm font-medium">Line items</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {data.lineItems.map((li: { id: string; description: string; amount: string }) => (
                  <li key={li.id}>
                    {li.description} — {formatCurrency(li.amount, r.currency ?? "USD")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
