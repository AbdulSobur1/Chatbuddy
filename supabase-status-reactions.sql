-- ─── Status Reactions Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS status_reactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_id BIGINT NOT NULL REFERENCES status_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(status_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE status_reactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view reactions"
  ON status_reactions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can add/remove reactions"
  ON status_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
  ON status_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Status Comments Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS status_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_id BIGINT NOT NULL REFERENCES status_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE status_comments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view comments"
  ON status_comments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can add comments"
  ON status_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON status_comments FOR DELETE
  USING (auth.uid() = user_id);
