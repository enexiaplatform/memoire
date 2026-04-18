export interface EntityWithMeta {
  id: string;
  user_id: string;
  entity_type: string;
  name: string;
  description: string;
  attributes: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
  capture_count?: number; // Computed metric
}

export interface RelationshipDetails {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  created_at: string;
  related_entity: {
    id: string;
    name: string;
    entity_type: string;
  };
}
