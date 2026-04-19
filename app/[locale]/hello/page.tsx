import { setRequestLocale, getTranslations } from 'next-intl/server';

export default async function HelloPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Hello');

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-sm text-fg-secondary">{t('description')}</p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t('cta')}
        </button>
        <span className="rounded border border-success-border bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
          locale: {locale}
        </span>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-bg-subtle p-4">
        <p className="text-xs uppercase tracking-wide text-fg-muted">Direction check</p>
        <p className="mt-2 text-sm">
          Logical padding: <span className="ms-4 inline-block bg-bg-muted px-2">ms-4</span>{' '}
          <span className="me-4 inline-block bg-bg-muted px-2">me-4</span>
        </p>
      </div>
    </main>
  );
}
