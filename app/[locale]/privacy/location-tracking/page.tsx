import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function LocationTrackingPrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('LocationTracking');

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{t('privacy_page_title')}</h1>
      <div className="mt-6 space-y-4 text-sm leading-6 text-fg-secondary">
        <p>{t('privacy_page_when')}</p>
        <p>{t('privacy_page_what')}</p>
        <p>{t('privacy_page_ios')}</p>
        <p>{t('privacy_page_retention')}</p>
        <p>{t('privacy_page_who')}</p>
      </div>
    </div>
  );
}
