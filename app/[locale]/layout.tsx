import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { ServiceWorkerRegister } from '@/components/sw-register';
import '../globals.css';

// Self-hosted Inter variable font — Latin subset only. Previous builds failed
// intermittently fetching from Google Fonts CDN; shipping the file with the
// build removes that dependency entirely.
const inter = localFont({
  src: '../fonts/inter-variable.woff2',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

// Self-hosted IBM Plex Sans Arabic — 4 weights, Arabic subset only (Latin
// fallback runs through Inter via the font-family chain in globals.css).
const ibmPlexArabic = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-arabic-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-arabic-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-arabic-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-arabic-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans-ar',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: 'Perception',
  description:
    'Bilingual SaaS for field marketing — campaigns, attendance, sales, stock, and reporting in one platform.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Perception' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Perception Cyan Wave — sets the browser chrome color on mobile
  themeColor: '#0abcd4',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${inter.variable} ${ibmPlexArabic.variable}`}
    >
      <body>
        {/* Perception brand accent strip — 4px gradient line at the very top.
            Appears across the whole app as a subtle brand signature. */}
        <div aria-hidden className="h-1 w-full bg-gradient-strip" />

        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
