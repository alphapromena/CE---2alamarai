import { z } from 'zod';

export const locationTrustCheckSchema = z
  .object({
    attendance_id: z.string().uuid(),
    lat: z.number().finite().gte(-90).lte(90),
    lng: z.number().finite().gte(-180).lte(180),
  })
  .strict();

export type LocationTrustCheckInput = z.infer<typeof locationTrustCheckSchema>;
