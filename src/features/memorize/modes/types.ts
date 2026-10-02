import type { TranslationId } from '@/lib/data/types';

import type { Unit } from '../passage';
import type { Report } from '../session';

export interface ModeProps {
  unit: Unit;
  tr: TranslationId;
  /** Seed for this attempt's random choices. */
  seed: number;
  /** Called whenever progress changes; feeds the session score. */
  onReport: (report: Report) => void;
}
