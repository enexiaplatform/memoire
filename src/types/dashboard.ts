export interface HeatmapCell {
  date: string;     // ISO date
  count: number;
}

export interface EntityCount {
  type: 'contacts' | 'deals' | 'insights' | 'meetings';
  count: number;
}

export interface TopRetrievedEntity {
  id: string;
  name: string;
  type: string;
  reference_count: number;
  last_referenced_at: string;
}
