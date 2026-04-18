-- Memoire Initial Schema
-- Multi-tenant architecture with Row-Level Security

-- User profiles (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'free', -- 'free' | 'active' | 'cancelled'
  subscription_tier TEXT DEFAULT 'free',   -- 'free' | 'personal' | 'team'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generic entities (Contact, Company, Deal, Meeting, Insight, Competitor)
CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor'
  name TEXT NOT NULL,
  description TEXT,
  attributes JSONB DEFAULT '{}', -- flexible user-defined fields
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relationships between entities (graph edges)
CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'works_at' | 'attended' | 'mentioned_in' | 'related_to'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Raw captures (user input before or after structuring)
CREATE TABLE public.captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  structured_data JSONB DEFAULT '{}', -- AI-extracted entities/relationships
  entity_ids UUID[] DEFAULT '{}',     -- linked entity IDs
  status TEXT DEFAULT 'processed',    -- 'pending' | 'processed'
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log (event-sourced, append-only)
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,     -- 'capture_created' | 'entity_created' | 'search_performed'
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_entities_user_id ON public.entities(user_id);
CREATE INDEX idx_entities_type ON public.entities(entity_type);
CREATE INDEX idx_captures_user_id ON public.captures(user_id);
CREATE INDEX idx_relationships_user_id ON public.relationships(user_id);
CREATE INDEX idx_relationships_source ON public.relationships(source_entity_id);
CREATE INDEX idx_relationships_target ON public.relationships(target_entity_id);

-- Row-Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can only see own profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can only see own entities" ON public.entities
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see own relationships" ON public.relationships
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see own captures" ON public.captures
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only see own activity" ON public.activity_log
  FOR ALL USING (auth.uid() = user_id);

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
