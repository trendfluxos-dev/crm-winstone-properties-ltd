-- One Google Drive folder per agent, so each agent's recordings land in their
-- own folder. Renames (agent name change) and moves (company root folder
-- change) are applied to the same Drive folder instead of creating a new one.
CREATE TABLE IF NOT EXISTS public.drive_agent_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_folder_id text NOT NULL,
  folder_id text NOT NULL,
  folder_name text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS drive_agent_folders_parent_idx
  ON public.drive_agent_folders (parent_folder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_agent_folders TO service_role;

ALTER TABLE public.drive_agent_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read drive agent folders" ON public.drive_agent_folders;
CREATE POLICY "Admins read drive agent folders"
ON public.drive_agent_folders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.drive_agent_folders TO authenticated;

DROP TRIGGER IF EXISTS touch_drive_agent_folders ON public.drive_agent_folders;
CREATE TRIGGER touch_drive_agent_folders
BEFORE UPDATE ON public.drive_agent_folders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();