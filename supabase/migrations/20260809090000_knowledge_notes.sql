-- Business memory: the part of what an operator knows that no record proves.
--
-- The Business Vault derives almost everything it shows. Accounts, deals,
-- people, products, objections and outcomes are already written in this
-- workspace, and deriving the map from them means the Vault can never become a
-- second copy of the business that disagrees with the first one.
--
-- What it cannot derive is the sentence behind the record. "They will not
-- qualify a second supplier until the Annex 1 audit closes" is not a field on a
-- deal; it outlives the deal, it applies to the next three, and until now it
-- lived in one person's head. Same for the other half: "we still do not know
-- who signs" is knowledge too, and it is the half a CRM never stores at all.
--
-- One table for both, because they are the same thing at two stages. A record
-- is a note (something learned) or a question (something not yet known), and a
-- question carrying a `gapKey` is the operator's standing answer to a gap the
-- Vault derived - which is how a derived gap stops being asked without anything
-- editing the derivation.
--
-- Rides the JSON-collection pattern (payload jsonb, keyed by user + id), the
-- same as order costs, receivables and supplier commitments, so it costs no API
-- function - api/ is at the Vercel Hobby ceiling of twelve.

CREATE TABLE IF NOT EXISTS public.knowledge_notes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.knowledge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own knowledge notes"
  ON public.knowledge_notes
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.knowledge_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_notes TO authenticated;

CREATE INDEX IF NOT EXISTS knowledge_notes_user_updated_idx
  ON public.knowledge_notes (user_id, updated_at DESC);
