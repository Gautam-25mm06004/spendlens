import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/config";

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (isClerkConfigured()) {
    return <ClerkProvider>{children}</ClerkProvider>;
  }
  return children;
}
