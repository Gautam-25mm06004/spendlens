import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { DemoBanner } from "@/components/demo-banner";
import { UsageBanner } from "@/components/usage-banner";
import { isClerkConfigured } from "@/lib/config";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/receipts", label: "Receipts" },
  { href: "/review", label: "Review" },
  { href: "/chat", label: "Chat" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerk = isClerkConfigured();

  return (
    <div className="min-h-screen flex flex-col">
      <DemoBanner />
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold text-primary">
              SpendLens
            </Link>
            <nav className="hidden gap-4 text-sm md:flex">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          {clerk ? (
            <UserButton />
          ) : (
            <span className="text-xs text-muted-foreground">Demo user</span>
          )}
        </div>
        <UsageBanner />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
