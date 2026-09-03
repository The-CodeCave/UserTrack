import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { SiteFooter } from "@/components/site/footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="bp-grid relative flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8"><Logo /></Link>
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <SiteFooter compact />
    </>
  );
}
