// 마케팅 팀 에이전트 공통 상수

export const AGENT_CONFIG = {
  LEADER: {
    icon: '👑',
    label: 'LEADER',
    role: '팀장 / 검토 / 승인',
    desc: '팀 지휘, 결과물 검토, 캘린더 발행',
    bgClass: 'bg-amber-50 border-amber-200',
    textClass: 'text-amber-700',
    badgeClass: 'bg-amber-100 text-amber-700',
    dotClass: 'bg-amber-400',
    contentTypes: ['weekly_calendar', 'monthly_report'],
  },
  MKT: {
    icon: '📝',
    label: 'MKT',
    role: '콘텐츠 담당',
    desc: '블로그, 인스타그램, 해시태그, 콘텐츠 캘린더',
    bgClass: 'bg-blue-50 border-blue-200',
    textClass: 'text-blue-700',
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-400',
    contentTypes: ['blog', 'insta'],
  },
  DSN: {
    icon: '🎨',
    label: 'DSN',
    role: '디자인 담당',
    desc: '블로그 썸네일, 인스타 이미지 프롬프트',
    bgClass: 'bg-purple-50 border-purple-200',
    textClass: 'text-purple-700',
    badgeClass: 'bg-purple-100 text-purple-700',
    dotClass: 'bg-purple-400',
    contentTypes: ['thumbnail', 'image_prompt'],
  },
  STR: {
    icon: '📊',
    label: 'STR',
    role: '전략 담당',
    desc: '키워드 전략, 경쟁사 분석, 월간 리포트',
    bgClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-700',
    badgeClass: 'bg-green-100 text-green-700',
    dotClass: 'bg-green-400',
    contentTypes: ['keyword_strategy', 'competitor_analysis', 'monthly_report'],
  },
} as const

export type AgentKey = keyof typeof AGENT_CONFIG

export const AGENT_KEYS: AgentKey[] = ['LEADER', 'MKT', 'DSN', 'STR']

export const CONTENT_TYPE_META: Record<string, { label: string; icon: string; agent: AgentKey }> = {
  blog:                { label: '블로그',              icon: '📝',  agent: 'MKT'    },
  insta:               { label: '인스타',               icon: '📸',  agent: 'MKT'    },
  insta_tips:          { label: '인스타 Tips',          icon: '💡',  agent: 'MKT'    },
  insta_service:       { label: '인스타 서비스',         icon: '🧹',  agent: 'MKT'    },
  insta_lifestyle:     { label: '인스타 라이프스타일',    icon: '☕',  agent: 'MKT'    },
  insta_beforeafter:   { label: '인스타 Before/After',  icon: '✨',  agent: 'MKT'    },
  insta_event:         { label: '인스타 시즌/이벤트',     icon: '🎉',  agent: 'MKT'    },
  thumbnail:           { label: '블로그 썸네일',          icon: '🖼️',  agent: 'DSN'    },
  image_prompt:        { label: '이미지 프롬프트',        icon: '🎨',  agent: 'DSN'    },
  weekly_calendar:     { label: '주간 캘린더',            icon: '📅',  agent: 'LEADER' },
  monthly_report:      { label: '월간 리포트',            icon: '📋',  agent: 'LEADER' },
  keyword_strategy:    { label: '키워드 전략',            icon: '🔍',  agent: 'STR'    },
  competitor_analysis: { label: '경쟁사 분석',            icon: '🔎',  agent: 'STR'    },
}
