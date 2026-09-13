ALTER TABLE public.recording_drive_backups DROP CONSTRAINT IF EXISTS recording_drive_backups_status_check;
ALTER TABLE public.recording_drive_backups ADD CONSTRAINT recording_drive_backups_status_check
  CHECK (status = ANY (ARRAY['pending','uploading','done','verified','failed']));

ALTER TABLE public.recording_doc_backups DROP CONSTRAINT IF EXISTS recording_doc_backups_status_check;
ALTER TABLE public.recording_doc_backups ADD CONSTRAINT recording_doc_backups_status_check
  CHECK (status = ANY (ARRAY['pending','uploading','done','verified','failed']));