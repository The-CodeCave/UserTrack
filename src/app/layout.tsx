import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsIdentity, AnalyticsScript } from "@/components/analytics/analytics";
import { Attribution } from "@/components/analytics/attribution";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "UserTrack — SaaS user growth, ranked", template: "%s · UserTrack" },
  description:
    "A public, verifiable leaderboard of SaaS user growth. Connect your product, get a shareable growth page and see who is gaining users right now.",
  openGraph: { siteName: "UserTrack", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0b0c0e", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <link rel="privacy-policy" href="/privacy" />
        <link rel="terms-of-service" href="/terms" />
        {/* No cookie read in the root layout: it would opt every public page out of ISR (OPS-2). The Convex token is resolved client-side. */}
        <ConvexClientProvider>
          {children}
          <AnalyticsIdentity />
        </ConvexClientProvider>
        <AnalyticsScript />
        <Attribution />
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
