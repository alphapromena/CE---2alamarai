import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { buildTemplate, isImportTarget, templateFilename } from '@/lib/imports/templates';

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string; target: string }> },
): Promise<Response> {
  await requireAdmin();
  const { target } = await context.params;
  if (!isImportTarget(target)) {
    return NextResponse.json({ error: 'unknown_target' }, { status: 404 });
  }

  const body = buildTemplate(target);
  const filename = templateFilename(target);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
