export interface SearchSource {
  id: string;
  raw_text: string;
  captured_at: string;
  similarity: number;
  entity_ids: string[];
}

export interface SearchResponse {
  answer: string;
  sources: SearchSource[];
  suggested_questions: string[];
  has_results: boolean;
}
