CREATE TABLE public.push_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, event_key text NOT NULL, token text NOT NULL, category text NOT NULL, title text NOT NULL, path text NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_status integer, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, UNIQUE(user_id,event_key,token));
GRANT ALL ON public.push_deliveries TO service_role;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_delivery_pending ON public.push_deliveries(next_attempt_at) WHERE status='pending';
CREATE FUNCTION public.claim_push_delivery(_id uuid) RETURNS SETOF public.push_deliveries LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE public.push_deliveries SET attempts=attempts+1,next_attempt_at=now()+interval '10 minutes' WHERE id=_id AND status='pending' AND next_attempt_at<=now() AND attempts<5 RETURNING * $$;
REVOKE ALL ON FUNCTION public.claim_push_delivery(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery(uuid) TO service_role;