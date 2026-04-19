import { Link } from '@/i18n/navigation';

export default function LocalePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Promoter Monitoring Platform</h1>
      <p className="mt-1 text-sm text-fg-secondary">Phase 0 foundation.</p>
      <p className="mt-4 text-sm">
        <Link href="/hello" className="text-accent hover:underline">
          /hello
        </Link>{' '}
        — RTL + i18n demo page.
      </p>
    </main>
  );
}
