import { defineConfig } from 'vitest/config'
import path from 'node:path'

// 단위 테스트 설정 (2026-11-01)
//   - `@/…` 경로 별칭을 tsconfig 와 동일하게 매핑
//   - 테스트 파일: src/**/__tests__/*.test.ts
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // 2026-11-20: .tsx 모듈(react-pdf 견적서)을 테스트에서 불러올 수 있도록 JSX 변환 지정 (tsconfig 는 preserve)
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
