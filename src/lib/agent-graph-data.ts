// 에이전트 그래프 정적 정의
// .claude/agents/*.md frontmatter 기반

export interface AgentNodeData extends Record<string, unknown> {
  agentId: string
  agentType: 'orchestrator' | 'dev' | 'marketing' | 'ops'
  displayName: string
  role: string
  icon: string
  color: string
  status: 'idle' | 'active'
  todayCount: number
  lastActiveAt: string | null
}

export const AGENT_DEFINITIONS: AgentNodeData[] = [
  // ── 오케스트레이터 ──────────────────────────────
  {
    agentId: 'bbk-lead',
    agentType: 'orchestrator',
    displayName: 'BBK Lead',
    role: '요구사항 분석 / 작업 분배',
    icon: '🎯',
    color: '#7c3aed',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  // ── 개발 팀 ────────────────────────────────────
  {
    agentId: 'bbk-developer',
    agentType: 'dev',
    displayName: 'Developer',
    role: 'Next.js / Supabase 구현',
    icon: '💻',
    color: '#2563eb',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-designer',
    agentType: 'dev',
    displayName: 'Designer',
    role: 'UI/UX / 컴포넌트 설계',
    icon: '🎨',
    color: '#0891b2',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-tester',
    agentType: 'dev',
    displayName: 'Tester',
    role: 'E2E / 단위 테스트',
    icon: '🧪',
    color: '#059669',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-deployer',
    agentType: 'ops',
    displayName: 'Deployer',
    role: 'Vercel 배포 / 환경변수 검증',
    icon: '🚀',
    color: '#d97706',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  // ── 마케팅 팀 ──────────────────────────────────
  {
    agentId: 'bbk-mkt-leader',
    agentType: 'marketing',
    displayName: 'MKT Leader',
    role: '마케팅 팀장 / 결재',
    icon: '👑',
    color: '#d97706',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-mkt-mkt',
    agentType: 'marketing',
    displayName: 'MKT',
    role: '블로그 / 인스타 콘텐츠',
    icon: '📝',
    color: '#2563eb',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-mkt-dsn',
    agentType: 'marketing',
    displayName: 'DSN',
    role: '썸네일 / 이미지 생성',
    icon: '🖼',
    color: '#7c3aed',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-mkt-str',
    agentType: 'marketing',
    displayName: 'STR',
    role: '키워드 전략 / 경쟁사 분석',
    icon: '📊',
    color: '#059669',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
  {
    agentId: 'bbk-mkt-insta',
    agentType: 'marketing',
    displayName: 'INSTA',
    role: '인스타그램 포스팅',
    icon: '📸',
    color: '#db2777',
    status: 'idle',
    todayCount: 0,
    lastActiveAt: null,
  },
]

export const AGENT_EDGE_PAIRS: Array<{ source: string; target: string; label?: string }> = [
  { source: 'bbk-lead', target: 'bbk-developer',  label: '개발 지시' },
  { source: 'bbk-lead', target: 'bbk-designer',   label: 'UI 지시' },
  { source: 'bbk-lead', target: 'bbk-tester',     label: '테스트 지시' },
  { source: 'bbk-lead', target: 'bbk-deployer',   label: '배포 지시' },
  { source: 'bbk-lead', target: 'bbk-mkt-leader', label: '마케팅 지시' },
  { source: 'bbk-mkt-leader', target: 'bbk-mkt-mkt',   label: '콘텐츠' },
  { source: 'bbk-mkt-leader', target: 'bbk-mkt-dsn',   label: '디자인' },
  { source: 'bbk-mkt-leader', target: 'bbk-mkt-str',   label: '전략' },
  { source: 'bbk-mkt-leader', target: 'bbk-mkt-insta', label: '인스타' },
]

export const TYPE_COLORS: Record<AgentNodeData['agentType'], string> = {
  orchestrator: 'bg-violet-100 text-violet-700 border-violet-200',
  dev:          'bg-blue-100 text-blue-700 border-blue-200',
  marketing:    'bg-amber-100 text-amber-700 border-amber-200',
  ops:          'bg-orange-100 text-orange-700 border-orange-200',
}
