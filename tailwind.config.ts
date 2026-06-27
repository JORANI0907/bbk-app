import type { Config } from "tailwindcss";

/**
 * BBK 디자인 시스템 토큰
 *
 * 규칙:
 * - 시멘틱 토큰(text-text-primary, bg-surface, shadow-soft 등)을 우선 사용
 * - 기존 클래스(text-gray-700, rounded-2xl 등)도 그대로 작동 — 점진 마이그레이션
 * - 임의값(text-[13px], rounded-[9px]) 사용 금지
 *
 * 상세: apps/bbk-app/docs/UI_REFINEMENT_PLAN.md
 */
const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── 색상 ──────────────────────────────────────────────────
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",

        // 브랜드 (기존 유지)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },

        // 표면 (배경 계층)
        surface: {
          DEFAULT: '#ffffff',
          sunken: '#f8fafc',   // slate-50 — 페이지 배경
          raised: '#ffffff',   // 모달/팝오버
          inverse: '#0f172a',  // 다크 표면(고대비 영역)
        },

        // 텍스트 시멘틱 (3단 위계)
        text: {
          primary: '#0f172a',   // slate-900 — 본문 기본
          secondary: '#475569', // slate-600 — 보조 텍스트
          tertiary: '#94a3b8',  // slate-400 — 메타/캡션
          inverse: '#ffffff',
          link: '#2563eb',      // brand-600
        },

        // 테두리 시멘틱
        border: {
          DEFAULT: '#e2e8f0',   // slate-200
          subtle: '#f1f5f9',    // slate-100 — 카드 기본
          strong: '#cbd5e1',    // slate-300 — 강조 구분
        },

        // 상태 (의미 색)
        state: {
          success: '#16a34a',   // green-600
          'success-bg': '#dcfce7',
          warning: '#f59e0b',   // amber-500
          'warning-bg': '#fef3c7',
          danger: '#dc2626',    // red-600
          'danger-bg': '#fee2e2',
          info: '#0284c7',      // sky-600
          'info-bg': '#e0f2fe',
        },
      },

      // ─── 음영 ──────────────────────────────────────────────────
      boxShadow: {
        flat: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        soft: '0 2px 8px -2px rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        card: '0 4px 16px -4px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        pop: '0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 4px 8px -4px rgba(15, 23, 42, 0.06)',
        modal: '0 16px 40px -8px rgba(15, 23, 42, 0.16), 0 8px 16px -8px rgba(15, 23, 42, 0.08)',
      },

      // ─── 둥글기 ────────────────────────────────────────────────
      // Tailwind 기본 + 의도적 명명 토큰 보강
      borderRadius: {
        // 기본은 Tailwind가 제공 (sm/md/lg/xl/2xl/3xl/full)
        // 추가 토큰 없이 기본 사용 (페이지에서 일관성을 강제)
      },

      // ─── 글자 ──────────────────────────────────────────────────
      // [size, { lineHeight, letterSpacing }] 형식 — 한글 가독성 최적화
      fontSize: {
        xs:   ['12px', { lineHeight: '1.5',   letterSpacing: '-0.01em' }],
        sm:   ['14px', { lineHeight: '1.6',   letterSpacing: '-0.01em' }],
        base: ['16px', { lineHeight: '1.625', letterSpacing: '-0.011em' }],
        lg:   ['18px', { lineHeight: '1.5',   letterSpacing: '-0.012em' }],
        xl:   ['20px', { lineHeight: '1.4',   letterSpacing: '-0.014em' }],
        '2xl': ['24px', { lineHeight: '1.35', letterSpacing: '-0.017em' }],
        '3xl': ['30px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '1.2',  letterSpacing: '-0.022em' }],
      },

      // ─── 폰트 패밀리 ───────────────────────────────────────────
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          '"Helvetica Neue"',
          '"Segoe UI"',
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          'sans-serif',
        ],
      },

      // ─── 컨테이너 max-width 명명 토큰 ─────────────────────────
      maxWidth: {
        'portal-mobile': '32rem',  // 512px — 고객 포털
        'portal-worker': '36rem',  // 576px — 작업자 포털
        'portal-admin': '80rem',   // 1280px — 관리자 포털
      },
    },
  },
  plugins: [],
};
export default config;
