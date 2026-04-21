export type AnonymizationState = 'original' | 'anonymized' | 'mixed';

export interface AnonymizationReplacement {
  from: string;
  to: string;
  reason: string;
}

export interface AnonymizationSuggestion {
  suggested: string;
  replacements: AnonymizationReplacement[];
}
