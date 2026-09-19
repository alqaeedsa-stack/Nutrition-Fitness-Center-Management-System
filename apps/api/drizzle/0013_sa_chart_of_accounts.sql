-- Saudi-oriented starter chart of accounts and default accounting links.
-- The structure follows the ERP principle used by Odoo: hierarchical accounts, typed accounts,
-- centralized defaults, and product-level overrides. Account names/codes remain editable per center.

INSERT INTO accounting_accounts (center_id,parent_id,code,name,account_type,is_active,is_system)
SELECT c.id,NULL,v.code,v.name,v.account_type,true,true FROM centers c CROSS JOIN (VALUES
('1000','الأصول','asset'),('2000','الالتزامات','liability'),('3000','حقوق الملكية','equity'),
('4000','الإيرادات','revenue'),('5000','المصروفات وتكلفة الإيرادات','expense')) v(code,name,account_type)
ON CONFLICT (center_id,code) DO UPDATE SET name=excluded.name,account_type=excluded.account_type,is_active=true,is_system=true;

INSERT INTO accounting_accounts (center_id,parent_id,code,name,account_type,is_active,is_system)
SELECT c.id,p.id,v.code,v.name,v.account_type,true,true FROM centers c
JOIN (VALUES
('1100','1000','الأصول المتداولة','asset'),('1200','1000','الأصول غير المتداولة','asset'),('1300','1000','الأصول غير الملموسة','asset'),
('2100','2000','الالتزامات المتداولة','liability'),('2200','2000','الالتزامات غير المتداولة','liability'),
('3100','3000','رأس المال','equity'),('3200','3000','الأرباح المحتجزة','equity'),
('4100','4000','إيرادات النشاط','revenue'),('4200','4000','إيرادات الخدمات والاشتراكات','revenue'),('4300','4000','إيرادات أخرى','revenue'),
('5100','5000','تكلفة الإيرادات والمبيعات','expense'),('5200','5000','مصروفات التشغيل','expense'),('5300','5000','الرواتب والمزايا','expense'),
('5400','5000','الإهلاك والمصاريف الأخرى','expense'),('5500','5000','المصاريف التمويلية والرسوم','expense')
) v(code,parent_code,name,account_type) ON true
JOIN accounting_accounts p ON p.center_id=c.id AND p.code=v.parent_code
ON CONFLICT (center_id,code) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,account_type=excluded.account_type,is_active=true,is_system=true;

INSERT INTO accounting_accounts (center_id,parent_id,code,name,account_type,is_active,is_system)
SELECT c.id,p.id,v.code,v.name,v.account_type,true,true FROM centers c
JOIN (VALUES
('1110','1100','الصندوق','asset'),('1120','1100','البنوك والحسابات الجارية','asset'),('1130','1100','العملاء والذمم المدينة','asset'),
('1140','1100','المخزون','asset'),('1150','1100','مصروفات ومدفوعات مقدمة','asset'),('1160','1100','ضريبة القيمة المضافة - مدخلات','asset'),
('1210','1200','الأراضي','asset'),('1220','1200','المباني','asset'),('1230','1200','الأثاث والتجهيزات','asset'),('1240','1200','الأجهزة والمعدات','asset'),
('1250','1200','السيارات ووسائل النقل','asset'),('1260','1200','مجمع الإهلاك','asset'),('1310','1300','البرمجيات والأصول غير الملموسة','asset'),
('2110','2100','الموردون والدائنون','liability'),('2120','2100','مصروفات مستحقة','liability'),('2130','2100','ضريبة القيمة المضافة - مخرجات','liability'),
('2140','2100','إيرادات مؤجلة - اشتراكات','liability'),('2150','2100','رواتب ومستحقات موظفين','liability'),('2160','2100','التزامات حكومية أخرى','liability'),
('2210','2200','قروض وتمويلات طويلة الأجل','liability'),('2220','2200','التزامات عقود الإيجار','liability'),
('3110','3100','رأس مال المالك','equity'),('3120','3100','مسحوبات المالك','equity'),('3210','3200','أرباح محتجزة','equity'),('3220','3200','أرباح/خسائر سنوات سابقة','equity'),
('4110','4100','مبيعات المنتجات','revenue'),('4120','4100','خصومات ومرتجعات المبيعات','revenue'),
('4210','4200','إيرادات الاشتراكات','revenue'),('4220','4200','إيرادات الخدمات والاستشارات','revenue'),('4310','4300','إيرادات أخرى','revenue'),('4320','4300','أرباح بيع الأصول','revenue'),
('5110','5100','تكلفة المبيعات','expense'),('5120','5100','مردودات المشتريات','expense'),
('5210','5200','الإيجارات','expense'),('5220','5200','الكهرباء والمياه','expense'),('5230','5200','الاتصالات والإنترنت','expense'),
('5240','5200','التسويق والإعلان','expense'),('5250','5200','البرامج والاشتراكات التقنية','expense'),('5260','5200','المصاريف المكتبية','expense'),
('5270','5200','السفر والضيافة','expense'),('5280','5200','الصيانة والإصلاح','expense'),('5290','5200','مصروفات تشغيلية أخرى','expense'),
('5310','5300','رواتب وأجور','expense'),('5320','5300','بدلات ومزايا الموظفين','expense'),('5330','5300','التأمينات الاجتماعية','expense'),
('5410','5400','مصروف إهلاك الأصول','expense'),('5420','5400','خسائر هبوط الأصول','expense'),
('5510','5500','رسوم بنكية','expense'),('5520','5500','مصروفات تمويلية','expense'),('5530','5500','رسوم حكومية وزكوية','expense')
) v(code,parent_code,name,account_type) ON true
JOIN accounting_accounts p ON p.center_id=c.id AND p.code=v.parent_code
ON CONFLICT (center_id,code) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,account_type=excluded.account_type,is_active=true,is_system=true;

INSERT INTO accounting_settings (center_id,inventory_account_id,input_vat_account_id,accounts_payable_account_id,cash_bank_account_id,accounts_receivable_account_id,revenue_account_id,output_vat_account_id,cost_of_sales_account_id,deferred_revenue_account_id,subscription_revenue_account_id,updated_at)
SELECT c.id,
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='1140'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='1160'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='2110'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='1110'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='1130'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='4110'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='2130'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='5110'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='2140'),
 (SELECT id FROM accounting_accounts a WHERE a.center_id=c.id AND a.code='4210'),
 now() FROM centers c
ON CONFLICT(center_id) DO UPDATE SET inventory_account_id=excluded.inventory_account_id,input_vat_account_id=excluded.input_vat_account_id,accounts_payable_account_id=excluded.accounts_payable_account_id,cash_bank_account_id=excluded.cash_bank_account_id,accounts_receivable_account_id=excluded.accounts_receivable_account_id,revenue_account_id=excluded.revenue_account_id,output_vat_account_id=excluded.output_vat_account_id,cost_of_sales_account_id=excluded.cost_of_sales_account_id,deferred_revenue_account_id=excluded.deferred_revenue_account_id,subscription_revenue_account_id=excluded.subscription_revenue_account_id,updated_at=now();

UPDATE products p SET inventory_account_id=a114.id,cost_of_sales_account_id=a511.id,revenue_account_id=CASE WHEN p.product_type='subscription' THEN a421.id WHEN p.product_type='service' THEN a422.id ELSE a411.id END,purchase_account_id=a114.id,sales_return_account_id=a412.id,purchase_return_account_id=a512.id,deferred_revenue_account_id=a214.id,subscription_revenue_account_id=a421.id
FROM accounting_accounts a114,accounting_accounts a511,accounting_accounts a411,accounting_accounts a412,accounting_accounts a512,accounting_accounts a214,accounting_accounts a421,accounting_accounts a422
WHERE p.center_id=a114.center_id AND a114.center_id=a511.center_id AND a511.center_id=a411.center_id AND a411.center_id=a412.center_id AND a412.center_id=a512.center_id AND a512.center_id=a214.center_id AND a214.center_id=a421.center_id AND a421.center_id=a422.center_id
AND a114.code='1140' AND a511.code='5110' AND a411.code='4110' AND a412.code='4120' AND a512.code='5120' AND a214.code='2140' AND a421.code='4210' AND a422.code='4220';