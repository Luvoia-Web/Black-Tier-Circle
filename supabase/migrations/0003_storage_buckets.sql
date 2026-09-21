-- Private bucket for product files (only accessible via signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-files',
  'product-files',
  false,  -- PRIVATE — never public
  52428800,  -- 50MB limit per file
  array[
    'application/pdf',
    'application/zip',
    'application/epub+zip',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
) on conflict (id) do nothing;

-- Private bucket for preview files (watermarked previews)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-previews',
  'product-previews',
  false,
  10485760,  -- 10MB limit
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- Storage RLS: only service role can read/write product-files
-- Signed URLs are generated server-side and expire after 1 hour
create policy "Service role only for product files"
  on storage.objects for all
  to service_role
  using (bucket_id = 'product-files');

create policy "Service role only for product previews"
  on storage.objects for all
  to service_role
  using (bucket_id = 'product-previews');
