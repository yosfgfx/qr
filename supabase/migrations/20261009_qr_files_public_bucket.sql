-- حاوية عامة ثابتة للملفات التي تحوّلها أداة QR إلى روابط.
-- الملفات تُخزَّن باسم مشتق من بصمة SHA-256: f/<hash>.<ext>
-- يُسمح للجميع بالإدراج فقط (لا تعديل ولا حذف عبر الـ API) فالرابط لا يتغير أبدًا.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qr-files', 'qr-files', true, 26214400,
  array[
    'image/png','image/jpeg','image/gif','image/webp','image/bmp','image/tiff','image/heic','image/heif','image/avif','image/x-icon',
    'application/pdf','application/zip','application/x-zip-compressed','application/x-rar-compressed','application/vnd.rar',
    'application/x-7z-compressed','application/gzip','application/x-tar','application/octet-stream',
    'text/plain','text/csv','text/vcard','text/calendar','text/markdown','application/json','application/rtf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation',
    'application/epub+zip','application/vnd.android.package-archive','application/postscript','image/vnd.adobe.photoshop',
    'audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/flac',
    'video/mp4','video/quicktime','video/webm','video/x-matroska','video/3gpp',
    'font/ttf','font/otf','font/woff','font/woff2','model/gltf-binary'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "qr-files: anonymous immutable uploads" on storage.objects;
create policy "qr-files: anonymous immutable uploads"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'qr-files'
  and name ~ '^f/[0-9a-f]{24,64}(\.[a-z0-9]{1,12})?$'
);
-- عمدًا: لا سياسات SELECT (منع سرد الملفات) ولا UPDATE ولا DELETE.
