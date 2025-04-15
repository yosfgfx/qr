import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

// وظيفة لإنشاء ملف ZIP يحتوي على QR codes
async function downloadAll(qrData) {
  const zip = new JSZip();
  const svgFolder = zip.folder("SVG");
  const pngFolder = zip.folder("PNG");
  
  // معالجة بيانات QR وإضافتها إلى ملف ZIP
  for (const item of qrData) {
    const { name, svgContent } = item;
    
    // إضافة ملف SVG
    svgFolder.file(`${name}.svg`, svgContent);
    
    // يمكن إضافة معالجة PNG هنا إذا كان ذلك مطلوبًا
    // ملاحظة: تحويل SVG إلى PNG على الخادم يتطلب مكتبات إضافية
  }
  
  // إنشاء ملف ZIP وحفظه
  const content = await zip.generateAsync({type: "nodebuffer"});
  const zipPath = path.join(process.cwd(), 'public', 'downloads', 'QRCodes.zip');
  
  // التأكد من وجود المجلد
  const dir = path.dirname(zipPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // كتابة الملف
  fs.writeFileSync(zipPath, content);
  
  return zipPath;
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { qrData } = req.body;
      const zipPath = await downloadAll(qrData);
      res.status(200).json({ 
        message: 'تم إنشاء ملف ZIP بنجاح',
        zipPath: '/downloads/QRCodes.zip' // المسار النسبي للملف للتنزيل
      });
    } catch (error) {
      console.error('خطأ في إنشاء ملف ZIP:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء ملف ZIP' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} غير مسموح به`);
  }
}
