-- 고객 등급 컬럼 추가
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS grade TEXT CHECK (grade IN ('화이트', '블루', '블랙'));
