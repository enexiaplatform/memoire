export interface ExtractedEntity {
  tempId: string;
  entity_type: 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor';
  name: string;
  description: string;
  matchedExistingId?: string;
}

export interface ExtractedRelationship {
  sourceTempId: string;
  targetTempId: string;
  relationship_type: string;
  label: string;
}

export interface ExtractionResponse {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  tags: string[];
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}
