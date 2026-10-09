/*
 * إعدادات التخزين السحابي لأداة QR.
 * -------------------------------------------------
 * المزوّد الافتراضي: Supabase Storage (الخطة المجانية).
 * الملفات تُرفع إلى حاوية عامة (public bucket) باسم مشتق من بصمة SHA-256
 * لمحتوى الملف، لذا:
 *   - الملف نفسه يعطي دائمًا نفس الرابط (لا تكرار في التخزين).
 *   - لا توجد صلاحيات تعديل/حذف عبر الـ API، فالرابط لا يتغير أبدًا.
 *
 * لتبديل المشروع: غيّر url و key و bucket فقط، ثم طبّق ملف
 * supabase/migrations/*.sql على المشروع الجديد.
 *
 * مفتاح "publishable/anon" مصمَّم ليكون عامًا في المتصفح؛ الحماية تأتي من
 * سياسات RLS على الحاوية (إدراج فقط ضمن المجلد f/ وبأسماء بصمة فقط).
 */
window.QR_CONFIG = {
  storage: {
    provider: 'supabase',
    url: 'https://qwjliaaonpthvufqaqyc.supabase.co',
    key: 'sb_publishable_QEdTuygm4BSaYfSQgDpH-A_FDLvomIP',
    bucket: 'qr-files',
    folder: 'f',
    // مرايا: عناوين تخزين قديمة تبقى الروابط المختصرة تعمل معها بعد نقل المشروع.
    // عند الانتقال إلى مشروع Supabase جديد: ضع العنوان الجديد في url وأضف القديم هنا.
    mirrors: [],
    // قاعدة الرابط المختصر. تُترك فارغة لتُشتق من عنوان الموقع نفسه (…/qr/f/).
    // ثبّتها يدويًا فقط إن نقلت الموقع إلى نطاق آخر وأردت إبقاء الروابط القديمة مطبوعة كما هي.
    shortBase: '',
    // الحد الأقصى لحجم الملف بالبايت (مطابق لحد الحاوية: 25 MB)
    maxBytes: 25 * 1024 * 1024,
    // طول بصمة SHA-256 (hex) المستخدم في اسم الملف: 24 حرفًا = 96 بت
    hashLength: 24,
    // أنواع MIME المسموح بها في الحاوية؛ أي نوع آخر يُرفع كـ application/octet-stream
    allowedMime: [
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
  }
};
