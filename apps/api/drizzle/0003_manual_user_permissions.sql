CREATE TABLE IF NOT EXISTS user_permissions (
  user_id uuid NOT NULL REFERENCES users(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS user_permissions_user_idx ON user_permissions(user_id);

INSERT INTO permissions (code, resource, action, description) VALUES
('staff.manage','staff','manage','إدارة حسابات الموظفين والصلاحيات'),
('customers.read','customers','read','عرض العملاء'),
('customers.create','customers','create','إضافة العملاء'),
('customers.update','customers','update','تعديل العملاء'),
('customers.delete','customers','delete','حذف العملاء'),
('appointments.read','appointments','read','عرض المواعيد'),
('appointments.manage','appointments','manage','إدارة المواعيد'),
('catalog.read','catalog','read','عرض المنتجات والتصنيفات'),
('catalog.write','catalog','write','إضافة وتعديل المنتجات'),
('inventory.read','inventory','read','عرض المخزون'),
('inventory.adjust','inventory','adjust','تعديل أرصدة المخزون'),
('pos.read','pos','read','عرض نقطة البيع والمبيعات'),
('pos.sell','pos','sell','إنشاء مبيعات'),
('pos.void','pos','void','إلغاء مبيعات'),
('orders.read','orders','read','عرض الطلبات'),
('orders.update','orders','update','تعديل حالات الطلبات'),
('nutrition.read','nutrition','read','عرض الخطط الغذائية'),
('nutrition.write','nutrition','write','إدارة الخطط الغذائية'),
('fitness.read','fitness','read','عرض الخطط الرياضية'),
('fitness.write','fitness','write','إدارة الخطط الرياضية'),
('reports.read','reports','read','عرض التقارير'),
('reports.export','reports','export','تصدير التقارير'),
('zatca.manage','zatca','manage','إدارة ZATCA والفوترة الإلكترونية')
ON CONFLICT (code) DO UPDATE SET resource=EXCLUDED.resource, action=EXCLUDED.action, description=EXCLUDED.description;

INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id FROM users u JOIN staff_profiles sp ON sp.user_id=u.id CROSS JOIN permissions p
WHERE sp.active=true AND sp.staff_type='admin' ON CONFLICT DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id,p.id FROM users u JOIN staff_profiles sp ON sp.user_id=u.id JOIN permissions p
ON p.code = ANY(CASE sp.staff_type
 WHEN 'warehouse' THEN ARRAY['catalog.read','catalog.write','inventory.read','inventory.adjust']::text[]
 WHEN 'cashier' THEN ARRAY['customers.read','customers.create','customers.update','pos.read','pos.sell','pos.void','orders.read','orders.update']::text[]
 WHEN 'doctor' THEN ARRAY['customers.read','customers.create','customers.update','appointments.read']::text[]
 WHEN 'nutritionist' THEN ARRAY['customers.read','customers.create','customers.update','nutrition.read','nutrition.write']::text[]
 WHEN 'trainer' THEN ARRAY['customers.read','customers.create','customers.update','fitness.read','fitness.write']::text[]
 WHEN 'employee' THEN ARRAY['customers.read','customers.create','customers.update']::text[]
 ELSE ARRAY[]::text[] END)
WHERE sp.active=true AND sp.staff_type <> 'admin' ON CONFLICT DO NOTHING;