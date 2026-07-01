import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { ExtractionResponse } from './types';

import type { AnonymizationState } from '../../types/anonymization';

export function useCaptureSubmit() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const saveCapture = async (
    rawText: string,
    extraction: ExtractionResponse,
    anonymizationData?: { state: AnonymizationState; originalText?: string; }
  ): Promise<boolean> => {
    if (!user) {
      setError('Sign in again before saving this capture.');
      return false;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Step 1 - Upsert entities
      const userId = user.id;
      const entityIdMap: Record<string, string> = {}; // Maps tempId to real UUID
      const finalEntityIds: string[] = [];

      for (const entity of extraction.entities) {
        if (entity.matchedExistingId) {
          entityIdMap[entity.tempId] = entity.matchedExistingId;
          finalEntityIds.push(entity.matchedExistingId);
        } else {
          // Insert new entity
          const { data: newEntity, error: entityError } = await supabase
            .from('entities')
            .insert({
              user_id: userId,
              entity_type: entity.entity_type,
              name: entity.name,
              description: entity.description,
            })
            .select('id')
            .single();

          if (entityError) throw entityError;
          if (newEntity) {
            entityIdMap[entity.tempId] = newEntity.id;
            finalEntityIds.push(newEntity.id);
          }
        }
      }

      // Step 2 - Insert relationships
      if (extraction.relationships.length > 0) {
        const relationshipsToInsert = extraction.relationships
          .map((rel) => {
            const sourceId = entityIdMap[rel.sourceTempId];
            const targetId = entityIdMap[rel.targetTempId];
            if (!sourceId || !targetId) return null;

            return {
              user_id: userId,
              source_entity_id: sourceId,
              target_entity_id: targetId,
              relationship_type: rel.relationship_type,
            };
          })
          .filter(Boolean); // Drop any where mapping failed

        if (relationshipsToInsert.length > 0) {
          const { error: relError } = await supabase
            .from('relationships')
            .insert(relationshipsToInsert);

          if (relError) throw relError;
        }
      }

      // Step 3 - Insert capture
      const { data: captureData, error: captureError } = await supabase
        .from('captures')
        .insert({
          user_id: userId,
          raw_text: rawText,
          structured_data: extraction, // The full preview JSON
          entity_ids: finalEntityIds, // Array of real entity UUIDs
          status: 'processed',
          anonymization_state: anonymizationData?.state || 'original',
          original_text: anonymizationData?.originalText || null,
          anonymized_at: anonymizationData?.state !== 'original' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (captureError) throw captureError;

      // Step 4 - Log activity
      if (captureData) {
        await supabase.from('activity_log').insert({
          user_id: userId,
          action: 'capture_created',
          entity_id: captureData.id,
          metadata: {
            entity_count: extraction.entities.length,
            tag_count: extraction.tags.length,
          },
        });

        // Trigger embedding generation as non-blocking fire-and-forget work.
        const { data: { session } } = await supabase.auth.getSession();
        fetch('/api/generate-embedding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            captureId: captureData.id,
            text: rawText,
            userId: userId,
            authToken: session?.access_token,
          }),
        }).catch(console.error);
      }

      setIsSaving(false);
      return true;
    } catch (e: any) {
      console.error('Save flow failed:', e);
      setError(e.message || 'Memoire could not save this capture. Please retry.');
      setIsSaving(false);
      return false;
    }
  };

  return { saveCapture, isSaving, error };
}
