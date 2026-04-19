import { setRequestLocale } from 'next-intl/server';
import { ResetRequestForm } from './reset-request-form';

export default async function ResetRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ResetRequestForm />;
}
