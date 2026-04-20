import { z } from 'zod';

const UUID = z.string().uuid();

export const FEEDBACK_CATEGORIES = [
  'service',
  'product',
  'complaint',
  'suggestion',
  'other',
] as const;

export const FEEDBACK_SENTIMENTS = ['positive', 'neutral', 'negative'] as const;

export const competitorMentionSchema = z.strictObject({
  brand: z.string().trim().min(1).max(120),
  context: z.string().trim().max(500).optional(),
  sentiment: z.enum(FEEDBACK_SENTIMENTS).optional(),
});

export const submitFeedbackSchema = z.strictObject({
  campaign_id: UUID,
  location_id: UUID,
  daily_report_id: UUID.optional(),
  supervisor_visit_id: UUID.optional(),
  category: z.enum(FEEDBACK_CATEGORIES),
  sentiment: z.enum(FEEDBACK_SENTIMENTS).optional(),
  body: z.string().trim().min(1).max(2000),
  competitors: z.array(competitorMentionSchema).max(10).optional(),
  idempotency_key: UUID,
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
