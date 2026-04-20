import { FileQuestion, Home } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function LocaleNotFound() {
  const t = await getTranslations('Errors');

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 py-12">
      <div className="w-full rounded-lg border border-border bg-bg-subtle p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-info-subtle text-info">
          <FileQuestion className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{t('not_found_title')}</h1>
        <p className="mt-2 text-sm text-fg-secondary">{t('not_found_description')}</p>
        <div className="mt-6 flex items-center justify-center">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('go_home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
