import { downloadAll } from '../../utils/qrHelpers';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { qrData } = req.body;
      await downloadAll(qrData);
      res.status(200).json({ message: 'تم إنشاء ملف ZIP بنجاح' });
    } catch (error) {
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء ملف ZIP' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} غير مسموح به`);
  }
}