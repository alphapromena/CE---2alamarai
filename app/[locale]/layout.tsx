import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { InstallPrompt } from '@/components/features/app/install-prompt';
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
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-120.png', sizes: '120x120', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-167.png', sizes: '167x167', type: 'image/png' },
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
  viewportFit: 'cover',
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
      <head>
        {/*
         * iOS PWA launch image. Next.js's metadata API doesn't cover
         * apple-touch-startup-image, so this ships as a raw <link>. Only the
         * iPhone 14/15 Pro portrait size is shipped in this pass — other
         * device sizes are tracked in D-038 as a documented follow-up.
         */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/apple-splash-1179-2556.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
