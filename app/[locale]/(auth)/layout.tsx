import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('Auth');
  return (
    <div className="flex min-h-screen flex-col bg-bg-subtle">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <p className="text-base font-semibold">{t('brand')}</p>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
