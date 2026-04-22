-- 에이전트 활동 로그 테이블
-- Claude Code hooks → Supabase → Realtime 파이프라인용

CREATE TABLE IF NOT EXISTS agent_activity_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      TEXT NOT NULL,
  agent_type      TEXT,
  parent_agent_id TEXT,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'SessionStart', 'SessionEnd',
    'SubagentStart', 'SubagentStop',
    'Stop', 'StopFailure'
  )),
  tool_name       TEXT,
  cwd             TEXT,
  message         TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent   ON agent_activity_logs(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_event   ON agent_activity_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_session ON agent_activity_logs(session_id, created_at DESC);

ALTER TABLE agent_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON agent_activity_logs
  FOR ALL TO authenticated USING (true);

CREATE POLICY "service_insert" ON agent_activity_logs
  FOR INSERT TO service_role WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE agent_activity_logs;
