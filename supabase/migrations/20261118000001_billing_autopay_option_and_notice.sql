-- 2026-11-18: 정기 결제 안내 보강
--   1) service_billings.allow_autopay       : 결제 페이지에 '정기결제(카드 자동결제)' 선택지를 보여줄지 (null = 청구 종류 기본값: 추가 청구서만 숨김)
--   2) service_billings.autopay_notice_sent_at : 자동결제 카드 고객에게 '결제 예정일 안내'를 보낸 시각 (청구서당 1회)
--   3) notification_templates '정기결제예정알림_정기딥/_정기엔드' : 결제 링크 없이 결제 예정일·금액·카드만 안내

alter table public.service_billings
  add column if not exists allow_autopay boolean,
  add column if not exists autopay_notice_sent_at timestamptz;

comment on column public.service_billings.allow_autopay is
  '결제 페이지 정기결제(카드 자동결제) 선택지 표시 여부. null 이면 billing_type 기본값 (onetime 숨김, 그 외 표시)';
comment on column public.service_billings.autopay_notice_sent_at is
  '자동결제 카드 고객 사전 안내(정기결제예정알림) 발송 시각. 청구서당 1회';

insert into public.notification_templates
  (code, scope, applicable_types, applicable_locations, category, title, subject, body,
   is_active, is_system, auto_used, trigger_desc, send_mode, is_locked)
values
  (
    '정기결제예정알림_정기딥', 'customer', array['정기딥케어'], array['customer_detail'], '결제',
    '정기 결제 예정 안내 (자동결제 카드)', 'BBK 공간케어 정기 결제 예정 안내 (범빌드코리아 주식회사)',
    E'{{업체명}} 고객님, 안녕하세요.\n\nBBK 공간케어를 믿고 맡겨 주셔서 진심으로 감사드립니다.\n등록해 주신 카드로 정기 결제가 예정되어 있어 미리 안내드립니다.\n\n─────────────────────\n정기 결제 안내\n · 결제 예정일 : {{다음결제일}}\n · 결제 금액 : {{계약금액}}원\n · 결제 카드 : {{자동결제카드}}\n─────────────────────\n※ 결제 예정일에 등록된 카드로 자동 결제되며, 따로 하실 일은 없습니다.\n※ 카드 변경이나 결제 관련 문의는 고객센터로 편히 연락 주세요.\n\n─────────────────────\n고객센터\n · 운영시간 : 평일/토요일 09:00 - 18:00시 / 주말 : 미운영\n · 대표번호 : 1522-9597 / 010-5434-4877\n · 카카오상담(빠른상담가능) : http://pf.kakao.com/_JTNxin',
    true, false, true,
    '자동결제 카드(빌링키)가 등록된 정기딥케어 고객의 pending 청구서에 결제기한 3일 전부터 1회 자동 발송 (cron/billing-notify). 고객관리 [결제 안내] 버튼을 결제기한 전에 누르면 결제 링크 대신 이 안내가 나간다. 결제 링크 없음.',
    'auto', false
  ),
  (
    '정기결제예정알림_정기엔드', 'customer', array['정기엔드케어'], array['customer_detail'], '결제',
    '정기 결제 예정 안내 (자동결제 카드)', 'BBK 공간케어 정기 결제 예정 안내 (범빌드코리아 주식회사)',
    E'{{업체명}} 고객님, 안녕하세요.\n\nBBK 공간케어를 믿고 맡겨 주셔서 진심으로 감사드립니다.\n등록해 주신 카드로 정기 결제가 예정되어 있어 미리 안내드립니다.\n\n─────────────────────\n정기 결제 안내\n · 결제 예정일 : {{다음결제일}}\n · 결제 금액 : {{계약금액}}원\n · 결제 카드 : {{자동결제카드}}\n─────────────────────\n※ 결제 예정일에 등록된 카드로 자동 결제되며, 따로 하실 일은 없습니다.\n※ 카드 변경이나 결제 관련 문의는 고객센터로 편히 연락 주세요.\n\n─────────────────────\n고객센터\n · 운영시간 : 평일/토요일 09:00 - 18:00시 / 주말 : 미운영\n · 대표번호 : 1522-9597 / 010-5434-4877\n · 카카오상담(빠른상담가능) : http://pf.kakao.com/_JTNxin',
    true, false, true,
    '자동결제 카드(빌링키)가 등록된 정기엔드케어 고객의 pending 청구서에 결제기한 3일 전부터 1회 자동 발송 (cron/billing-notify). 고객관리 [결제 안내] 버튼을 결제기한 전에 누르면 결제 링크 대신 이 안내가 나간다. 결제 링크 없음.',
    'auto', false
  )
on conflict (code) do nothing;
