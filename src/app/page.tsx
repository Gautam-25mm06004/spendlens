import Link from "next/link";
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isClerkConfigured } from "@/lib/config";

export default function HomePage() {
  const clerk = isClerkConfigured();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
        <span className="text-lg font-semibold text-primary">SpendLens</span>
        <div className="flex gap-2">
          {clerk ? (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button variant="ghost">Sign in</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button>Get started</Button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Button asChild>
                  <Link href="/dashboard">Open app</Link>
                </Button>
              </Show>
            </>
          ) : (
            <Button asChild>
              <Link href="/dashboard">Try demo</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Turn receipts into spending intelligence
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Upload photos or PDFs, get structured extraction with confidence scores,
            fix low-confidence fields in a review queue, and chat with your data —
            every answer grounded in your receipts.
          </p>
          {!clerk && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Running in demo mode — no database or API keys needed. Click Try demo to explore.
            </p>
          )}
        </div>
        {clerk ? (
          <>
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <Button size="lg">Start free</Button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Button asChild size="lg">
                <Link href="/upload">Upload a receipt</Link>
              </Button>
            </Show>
          </>
        ) : (
          <Button asChild size="lg">
            <Link href="/dashboard">Open demo dashboard</Link>
          </Button>
        )}

        <div className="mt-8 grid w-full max-w-4xl gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Vision extraction</CardTitle>
              <CardDescription>Gemini Flash + Zod schema + arithmetic validation</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Low-confidence fields route to human review — not blind API output.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Grounded chat</CardTitle>
              <CardDescription>Whitelisted SQL tool with tenant isolation</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Answers cite source receipt IDs; honest fallback when data is missing.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Eval in CI</CardTitle>
              <CardDescription>Field-level eval runs on every pull request</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Merchant, total and date accuracy checked against thresholds, plus a weekly drift run.
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
