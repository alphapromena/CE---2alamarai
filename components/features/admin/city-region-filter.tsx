'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Select } from '@/components/ui/select';

export function CityRegionFilter({
  value,
  regions,
}: {
  value: string | null;
  regions: { id: string; label: string }[];
}) {
  const t = useTranslations('Admin.cities');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="city-region-filter"
        className="text-xs font-medium uppercase tracking-wide text-fg-muted"
      >
        {t('filter_region_label')}
      </label>
      <Select
        id="city-region-filter"
        value={value ?? ''}
        size="sm"
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => {
            router.replace(next ? `/admin/cities?region=${next}` : '/admin/cities');
          });
        }}
        className="w-56"
      >
        <option value="">{t('filter_region_all')}</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
