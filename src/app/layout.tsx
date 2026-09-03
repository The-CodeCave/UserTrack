import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { getToken } from "@/lib/auth-server";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const token = await getToken();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <link rel="privacy-policy" href="/privacy" />
        <link rel="terms-of-service" href="/terms" />
        <ConvexClientProvider initialToken={token}>{children}</ConvexClientProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
