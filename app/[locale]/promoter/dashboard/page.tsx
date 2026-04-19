import { useTranslations } from 'next-intl';

export default function PromoterDashboardPage() {
  const t = useTranslations('Promoter.dashboard');
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
      </div>
    </div>
  );
}
