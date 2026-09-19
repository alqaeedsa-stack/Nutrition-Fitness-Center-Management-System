import { eq } from 'drizzle-orm';
import { withDatabase } from '../db/client';
import { permissions, staffProfiles, userPermissions } from '../db/schema';
import { getAuthenticatedUser } from '../auth/session';

export type PermissionCode =
  | 'staff.manage'
  | 'customers.read'
  | 'customers.create'
  | 'customers.update'
  | 'customers.delete'
  | 'appointments.read'
  | 'appointments.manage'
  | 'catalog.read'
  | 'catalog.write'
  | 'inventory.read'
  | 'inventory.adjust'
  | 'pos.read'
  | 'pos.sell'
  | 'pos.void'
  | 'orders.read'
  | 'orders.update'
  | 'measurements.read'
  | 'measurements.write'
  | 'followups.read'
  | 'followups.write'
  | 'nutrition.read'
  | 'nutrition.write'
  | 'fitness.read'
  | 'fitness.write'
  | 'reports.read'
  | 'reports.export'
  | 'zatca.manage'
  | 'accounting.read'
  | 'accounting.write'
  | 'accounting.accounts.create'
  | 'accounting.accounts.update'
  | 'accounting.accounts.duplicate'
  | 'accounting.accounts.archive'
  | 'accounting.accounts.delete'
  | 'purchases.read'
  | 'purchases.write'
  | 'purchases.post'
  | 'purchases.pay';

export const PERMISSIONS: Array<{ code: PermissionCode; resource: string; action: string; name: string }> = [
  { code: 'staff.manage', resource: 'staff', action: 'manage', name: 'إدارة الموظفين والصلاحيات' },
  { code: 'customers.read', resource: 'customers', action: 'read', name: 'عرض العملاء' },
  { code: 'customers.create', resource: 'customers', action: 'create', name: 'إضافة العملاء' },
  { code: 'customers.update', resource: 'customers', action: 'update', name: 'تعديل العملاء' },
  { code: 'customers.delete', resource: 'customers', action: 'delete', name: 'حذف العملاء' },
  { code: 'appointments.read', resource: 'appointments', action: 'read', name: 'عرض المواعيد' },
  { code: 'appointments.manage', resource: 'appointments', action: 'manage', name: 'إدارة المواعيد' },
  { code: 'catalog.read', resource: 'catalog', action: 'read', name: 'عرض المنتجات والتصنيفات' },
  { code: 'catalog.write', resource: 'catalog', action: 'write', name: 'إضافة وتعديل المنتجات' },
  { code: 'inventory.read', resource: 'inventory', action: 'read', name: 'عرض المخزون' },
  { code: 'inventory.adjust', resource: 'inventory', action: 'adjust', name: 'تعديل أرصدة المخزون' },
  { code: 'pos.read', resource: 'pos', action: 'read', name: 'عرض نقطة البيع والمبيعات' },
  { code: 'pos.sell', resource: 'pos', action: 'sell', name: 'إنشاء مبيعات' },
  { code: 'pos.void', resource: 'pos', action: 'void', name: 'إلغاء مبيعات' },
  { code: 'orders.read', resource: 'orders', action: 'read', name: 'عرض الطلبات' },
  { code: 'orders.update', resource: 'orders', action: 'update', name: 'تعديل حالات الطلبات' },
  { code: 'measurements.read', resource: 'measurements', action: 'read', name: 'عرض القياسات' },
  { code: 'measurements.write', resource: 'measurements', action: 'write', name: 'إدارة القياسات' },
  { code: 'followups.read', resource: 'followups', action: 'read', name: 'عرض المتابعات' },
  { code: 'followups.write', resource: 'followups', action: 'write', name: 'إدارة المتابعات' },
  { code: 'nutrition.read', resource: 'nutrition', action: 'read', name: 'عرض الخطط الغذائية' },
  { code: 'nutrition.write', resource: 'nutrition', action: 'write', name: 'إدارة الخطط الغذائية' },
  { code: 'fitness.read', resource: 'fitness', action: 'read', name: 'عرض الخطط الرياضية' },
  { code: 'fitness.write', resource: 'fitness', action: 'write', name: 'إدارة الخطط الرياضية' },
  { code: 'reports.read', resource: 'reports', action: 'read', name: 'عرض التقارير' },
  { code: 'reports.export', resource: 'reports', action: 'export', name: 'تصدير التقارير' },
  { code: 'zatca.manage', resource: 'zatca', action: 'manage', name: 'إدارة ZATCA والفوترة الإلكترونية' },
  { code: 'accounting.read', resource: 'accounting', action: 'read', name: 'عرض المحاسبة' },
  { code: 'accounting.write', resource: 'accounting', action: 'write', name: 'إدارة المحاسبة والترحيل' },
  { code: 'accounting.accounts.create', resource: 'accounting_accounts', action: 'create', name: 'إنشاء حسابات دليل الحسابات' },
  { code: 'accounting.accounts.update', resource: 'accounting_accounts', action: 'update', name: 'تعديل حسابات دليل الحسابات' },
  { code: 'accounting.accounts.duplicate', resource: 'accounting_accounts', action: 'duplicate', name: 'تكرار حسابات دليل الحسابات' },
  { code: 'accounting.accounts.archive', resource: 'accounting_accounts', action: 'archive', name: 'أرشفة واستعادة حسابات دليل الحسابات' },
  { code: 'accounting.accounts.delete', resource: 'accounting_accounts', action: 'delete', name: 'حذف حسابات دليل الحسابات' },
  { code: 'purchases.read', resource: 'purchases', action: 'read', name: 'عرض المشتريات والموردين' },
  { code: 'purchases.write', resource: 'purchases', action: 'write', name: 'إنشاء وتعديل مستندات المشتريات' },
  { code: 'purchases.post', resource: 'purchases', action: 'post', name: 'ترحيل فواتير الموردين' },
  { code: 'purchases.pay', resource: 'purchases', action: 'pay', name: 'تسجيل مدفوعات الموردين' },
];

export async function getUserPermissionCodes(env: any, userId: string) {
  return withDatabase(env, async db => {
    const rows = await db.select({ code: permissions.code })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(eq(userPermissions.userId, userId));
    return rows.map(row => row.code as PermissionCode);
  });
}

export async function hasPermission(env: any, userId: string, code: PermissionCode) {
  const codes = await getUserPermissionCodes(env, userId);
  return codes.includes(code);
}

export async function requirePermission(c: any, code: PermissionCode) {
  const user = await getAuthenticatedUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: { code: 'UNAUTHENTICATED', message: 'يجب تسجيل الدخول' } }, 401) };

  const profile = await withDatabase(c.env, db => db.select({
    id: staffProfiles.id, staffType: staffProfiles.staffType, active: staffProfiles.active,
  }).from(staffProfiles).where(eq(staffProfiles.userId, user.userId)).limit(1));

  if (!profile[0]?.active) {
    return { error: c.json({ error: { code: 'STAFF_ACCESS_REQUIRED', message: 'هذه الوحدة للموظفين فقط' } }, 403) };
  }

  if (profile[0].staffType === 'admin') return { user, profile: profile[0] };

  if (!(await hasPermission(c.env, user.userId, code))) {
    return { error: c.json({ error: { code: 'PERMISSION_REQUIRED', message: 'لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء', permission: code } }, 403) };
  }

  return { user, profile: profile[0] };
}
