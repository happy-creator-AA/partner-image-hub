
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'partner');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  website text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "admin profile read" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, company_name, contact_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'company_name', ''), COALESCE(NEW.raw_user_meta_data->>'contact_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'partner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ITEMS
CREATE TYPE public.item_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.processing_status AS ENUM ('awaiting_upload', 'queued', 'processing', 'ready', 'failed');

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  sku text,
  description text,
  material text,
  dimensions text,
  status public.item_status NOT NULL DEFAULT 'pending',
  processing public.processing_status NOT NULL DEFAULT 'awaiting_upload',
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_partner_idx ON public.items(partner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT ON public.items TO anon;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner reads own items" ON public.items FOR SELECT TO authenticated USING (auth.uid() = partner_id);
CREATE POLICY "admin reads all items" ON public.items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "public reads approved items" ON public.items FOR SELECT TO anon USING (status = 'approved');
CREATE POLICY "partner inserts own items" ON public.items FOR INSERT TO authenticated WITH CHECK (auth.uid() = partner_id);
CREATE POLICY "partner updates own items" ON public.items FOR UPDATE TO authenticated USING (auth.uid() = partner_id) WITH CHECK (auth.uid() = partner_id);
CREATE POLICY "admin updates items" ON public.items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "partner deletes own items" ON public.items FOR DELETE TO authenticated USING (auth.uid() = partner_id);

-- IMAGES
CREATE TYPE public.image_kind AS ENUM ('source', 'reference', 'orthographic');

CREATE TABLE public.item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.image_kind NOT NULL DEFAULT 'source',
  variant text NOT NULL DEFAULT 'original',
  storage_key text NOT NULL,
  public_url text,
  file_name text,
  content_type text,
  size_bytes bigint,
  width int,
  height int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_images_item_idx ON public.item_images(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_images TO authenticated;
GRANT SELECT ON public.item_images TO anon;
GRANT ALL ON public.item_images TO service_role;
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner reads own images" ON public.item_images FOR SELECT TO authenticated USING (auth.uid() = partner_id);
CREATE POLICY "admin reads all images" ON public.item_images FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "public reads approved images" ON public.item_images FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.status = 'approved'));
CREATE POLICY "partner inserts own images" ON public.item_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = partner_id);
CREATE POLICY "partner deletes own images" ON public.item_images FOR DELETE TO authenticated USING (auth.uid() = partner_id);

-- EVENTS
CREATE TYPE public.event_type AS ENUM ('view', 'click', 'search');

CREATE TABLE public.item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  event_type public.event_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_events_item_idx ON public.item_events(item_id, created_at DESC);
GRANT SELECT ON public.item_events TO authenticated;
GRANT ALL ON public.item_events TO service_role;
ALTER TABLE public.item_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner reads own item events" ON public.item_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.partner_id = auth.uid()));
CREATE POLICY "admin reads all events" ON public.item_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
