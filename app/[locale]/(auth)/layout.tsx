import type { ReactNode } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-subtle">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <Link href="/" className="inline-flex items-center" aria-label="Perception">
            <Image
              src="/brand/perception-logo.png"
              alt="Perception"
              width={32}
              height={32}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
