import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { ServiceWorkerRegister } from '@/components/sw-register';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-ar',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Promoter Monitoring Platform',
  description:
    'Bilingual SaaS for field marketing: campaigns, attendance, sales, stock, and reporting.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Promoter' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
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
    <html lang={locale} dir={direction} className={`${inter.variable} ${ibmPlexArabic.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
