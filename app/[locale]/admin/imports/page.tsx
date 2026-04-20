import { ArrowRight, Box, MapPinned, Users } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const TARGETS = [
  { key: 'products', href: '/admin/imports/products', icon: Box },
  { key: 'promoters', href: '/admin/imports/promoters', icon: Users },
  { key: 'locations', href: '/admin/imports/locations', icon: MapPinned },
] as const;

export default async function AdminImportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin.imports');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TARGETS.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            className="group flex flex-col justify-between rounded-lg border border-border bg-white p-5 transition-colors hover:border-accent hover:bg-bg-hover"
          >
            <div>
              <Icon className="h-5 w-5 text-fg-secondary" strokeWidth={1.75} aria-hidden />
              <h2 className="mt-3 text-base font-semibold">{t(`${key}_title`)}</h2>
              <p className="mt-1 text-sm text-fg-secondary">{t(`${key}_description`)}</p>
            </div>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              {t('open_cta')}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
