-- 직원 서류 요청 시 노출되는 서류 유형 마스터.
-- 관리자가 UI에서 편집 가능. 기존 저장된 요청/서류는 worker_document_request_items.document_label
-- 스냅샷으로 유지되므로 이 테이블 변경 영향 없음.

CREATE TABLE worker_document_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  hint text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_other boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_worker_document_types_sort ON worker_document_types(sort_order) WHERE is_active = true;

COMMENT ON COLUMN worker_document_types.value IS '내부 식별 값 (예: safety_edu). worker_document_request_items.document_type 에 사용됨.';
COMMENT ON COLUMN worker_document_types.is_other IS '"기타" 항목 여부 (true 면 요청 시 사용자가 라벨 직접 입력)';
COMMENT ON COLUMN worker_document_types.is_active IS 'false 면 UI 리스트에 노출 안 되지만 기존 요청은 유지됨';

INSERT INTO worker_document_types (value, label, hint, sort_order, is_other) VALUES
  ('safety_edu',      '건설안전교육 이수증', '건설업 기초 안전보건교육 이수증',        1, false),
  ('health_cert',     '보건증',            '식품위생 관련 보건증 (유효기간 확인 필요)', 2, false),
  ('labor_contract',  '근로계약서',         '서명 완료된 근로계약서 사본',           3, false),
  ('bank_copy',       '통장 사본',          '급여 이체용 통장 사본',                4, false),
  ('certification',   '자격증',            '보유 자격증 사본',                      5, false),
  ('id_card',         '신분증 사본',         '주민등록증 또는 운전면허증 사본',        6, false),
  ('criminal_record', '범죄경력회보서',      '경찰서 발급 범죄경력회보서',            7, false),
  ('other',           '기타',              '체크박스 선택 시 라벨을 직접 입력',       8, true);
