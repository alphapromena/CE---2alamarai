import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/auth/guards';
import { listCampaigns } from '@/lib/queries/campaigns';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { i18n } from '@/lib/validations/i18n';
import { NewExportForm } from '@/components/features/exports/new-export-form';

export default async function AdminExportsNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations('Exports.new');

  const admin = createAdminSupabase();
  const [campaigns, locationsData, skusData] = await Promise.all([
    listCampaigns(null),
    admin.from('locations').select('id, name_i18n').eq('active', true).order('created_at'),
    admin.from('skus').select('id, name_i18n').eq('active', true).order('created_at'),
  ]);

  const campaignOpts = campaigns.map((c) => ({
    id: c.id,
    label: i18n(c.name_i18n, locale),
  }));
  const locationOpts = ((locationsData.data as { id: string; name_i18n: { ar?: string; en?: string } | null }[] | null) ?? [])
    .map((l) => ({ id: l.id, label: i18n(l.name_i18n, locale) }));
  const skuOpts = ((skusData.data as { id: string; name_i18n: { ar?: string; en?: string } | null }[] | null) ?? [])
    .map((s) => ({ id: s.id, label: i18n(s.name_i18n, locale) }));

  const safeLocale: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-b border-border pb-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{t('subtitle')}</p>
      </header>
      <div className="pt-6">
        <NewExportForm
          locale={safeLocale}
          role="admin"
          campaigns={campaignOpts}
          locations={locationOpts}
          skus={skuOpts}
          landingPath="/admin/exports"
        />
      </div>
    </div>
  );
}
