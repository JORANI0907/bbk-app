import { defineConfig } from 'vitest/config'
import path from 'node:path'

// 단위 테스트 설정 (2026-11-01)
//   - `@/…` 경로 별칭을 tsconfig 와 동일하게 매핑
//   - 테스트 파일: src/**/__tests__/*.test.ts
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
