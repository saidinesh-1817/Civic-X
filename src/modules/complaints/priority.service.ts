import { Priority } from '@prisma/client';

export interface PriorityCalculationResult {
  priority: Priority;
  reason: string;
  matched_keywords: string[];
}

export class PriorityService {
  private static readonly CRITICAL_KEYWORDS = [
    'live wire',
    'fallen wire',
    'electric shock',
    'electrocution',
    'gas leak',
    'fire hazard',
    'pipeline burst',
    'burst pipe',
    'collapsed wall',
    'building collapse',
    'open manhole',
    'manhole cover missing',
    'sparking transformer',
    'explosion hazard',
    'major flood',
    'road cave in',
    'sinkhole',
  ];

  private static readonly HIGH_KEYWORDS = [
    'sewage overflow',
    'sewage leak',
    'garbage dump',
    'solid waste',
    'no drinking water',
    'contaminated water',
    'dengue outbreak',
    'traffic signal down',
    'traffic lights broken',
    'deep pothole',
    'blocked drain',
    'stagnant water',
    'water logging',
    'fallen tree',
  ];

  private static readonly LOW_KEYWORDS = [
    'garden pruning',
    'tree trimming',
    'bench repair',
    'park maintenance',
    'graffiti',
    'cosmetic painting',
    'signboard cleaning',
    'leaf litter',
    'lawn mowing',
    'poster removal',
  ];

  /**
   * Deterministically calculates complaint priority based on text heuristics and department context
   */
  public static calculatePriority(
    title: string,
    description: string,
    departmentName?: string
  ): PriorityCalculationResult {
    const text = `${title} ${description}`.toLowerCase();

    // 1. Check for Critical keywords
    const matchedCritical = this.CRITICAL_KEYWORDS.filter((kw) => text.includes(kw));
    if (matchedCritical.length > 0) {
      return {
        priority: Priority.CRITICAL,
        reason: `Urgent public safety concern identified based on keywords: [${matchedCritical.join(', ')}]`,
        matched_keywords: matchedCritical,
      };
    }

    // 2. Check for High keywords
    const matchedHigh = this.HIGH_KEYWORDS.filter((kw) => text.includes(kw));
    if (matchedHigh.length > 0) {
      return {
        priority: Priority.HIGH,
        reason: `Elevated public health/infrastructure impact identified based on keywords: [${matchedHigh.join(', ')}]`,
        matched_keywords: matchedHigh,
      };
    }

    // 3. Check for Low keywords
    const matchedLow = this.LOW_KEYWORDS.filter((kw) => text.includes(kw));
    if (matchedLow.length > 0) {
      return {
        priority: Priority.LOW,
        reason: `Routine cosmetic/aesthetic issue identified based on keywords: [${matchedLow.join(', ')}]`,
        matched_keywords: matchedLow,
      };
    }

    // 4. Department Context Default
    if (departmentName) {
      const deptLower = departmentName.toLowerCase();
      if (deptLower.includes('electricity') || deptLower.includes('health')) {
        return {
          priority: Priority.HIGH,
          reason: `Default elevated priority assigned for essential public service department: ${departmentName}`,
          matched_keywords: [],
        };
      }
      if (deptLower.includes('park') || deptLower.includes('garden')) {
        return {
          priority: Priority.LOW,
          reason: `Default routine priority assigned for recreational department: ${departmentName}`,
          matched_keywords: [],
        };
      }
    }

    // 5. Default Priority
    return {
      priority: Priority.MEDIUM,
      reason: 'Standard civic issue priority assigned by default rule engine.',
      matched_keywords: [],
    };
  }
}
