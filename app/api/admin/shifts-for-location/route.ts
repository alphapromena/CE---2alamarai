import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { listShiftsForLocation } from '@/lib/queries/assignments';

const querySchema = z.object({ location_id: z.string().uuid() });

function trimSec(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export async function GET(request: Request): Promise<Response> {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ location_id: searchParams.get('location_id') });
  if (!parsed.success) {
    return NextResponse.json({ shifts: [] }, { status: 400 });
  }

  const rows = await listShiftsForLocation(parsed.data.location_id);
  const shifts = rows.map((r) => {
    const days = r.days_of_week
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d] ?? '?')
      .join('·');
    return {
      id: r.id,
      summary: `${trimSec(r.start_time)}–${trimSec(r.end_time)} · ${days}`,
    };
  });
  return NextResponse.json({ shifts });
}
