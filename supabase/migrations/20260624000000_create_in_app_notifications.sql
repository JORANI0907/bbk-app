-- 고객 포털 인앱 알림 테이블
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id
  ON public.in_app_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_is_read
  ON public.in_app_notifications(user_id, is_read);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_own_notifications" ON public.in_app_notifications
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_id = auth.uid()
    )
  );
