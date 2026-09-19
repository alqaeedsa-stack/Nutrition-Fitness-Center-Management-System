INSERT INTO permissions (code, resource, action, description)
VALUES
  ('purchases.read', 'purchases', 'read', 'عرض المشتريات والموردين'),
  ('purchases.write', 'purchases', 'write', 'إنشاء وتعديل مستندات المشتريات'),
  ('purchases.post', 'purchases', 'post', 'ترحيل فواتير الموردين'),
  ('purchases.pay', 'purchases', 'pay', 'تسجيل مدفوعات الموردين')
ON CONFLICT (code) DO NOTHING;
