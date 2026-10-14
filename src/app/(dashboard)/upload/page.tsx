"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function UploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/receipts/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.duplicate) {
        toast.message("Duplicate receipt", { description: data.message });
        router.push(`/receipts/${data.receiptId}`);
        return;
      }
      toast.success("Receipt processed", {
        description: `Status: ${data.status} (${data.latencyMs}ms)`,
      });
      if (data.status === "needs_review") router.push("/review");
      else router.push(`/receipts/${data.receiptId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload receipt</CardTitle>
        <CardDescription>JPEG, PNG, or PDF up to 10 MB. Gemini vision extracts structured data.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 hover:bg-muted/50">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Extracting…" : "Drop a receipt or click to browse"}
          </p>
        </label>
        {uploading && (
          <Button className="mt-4" disabled>
            Processing…
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
