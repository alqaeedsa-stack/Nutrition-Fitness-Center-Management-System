import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type StaffMember = {
  id: string; userId: string; displayName: string; staffType: string; active: boolean;
  email?: string | null; phone?: string | null; createdAt?: string;
};
type Permission = { code: string; resource: string; action: string; name: string };

const staffTypes = [
  ['admin', 'إدارة'], ['doctor', 'طبيب'], ['nutritionist', 'أخصائي تغذية'], ['trainer', 'مدرب'],
  ['employee', 'موظف'], ['cashier', 'كاشير'], ['warehouse', 'مخازن'],
] as const;
const typeLabel = Object.fromEntries(staffTypes);;
const permissionGroups = [
  { key: 'store', label: 'المتجر', resources: ['catalog', 'pos', 'orders'] },
  { key: 'inventory', label: 'المخزون', resources: ['inventory'] },
  { key: 'customers', label: 'العملاء', resources: ['customers'] },
  { key: 'appointments', label: 'المواعيد', resources: ['appointments'] },
  { key: 'nutrition', label: 'التغذية', resources: ['nutrition'] },
  { key: 'fitness', label: 'اللياقة', resources: ['fitness'] },
  { key: 'reports', label: 'التقارير', resources: ['reports'] },
  { key: 'staff', label: 'إدارة الموظفين', resources: ['staff'] },
  { key: 'zatca', label: 'الفوترة الإلكترونية', resources: ['zatca'] },
] as const;

function getGroupPermissions(group: typeof permissionGroups[number], permissions: Permission[]) {
  return permissions.filter(permission => group.resources.includes(permission.resource as never));
}

type PermissionSelectorProps = {
  permissions: Permission[];
  selected: string[];
  disabled?: boolean;
  onToggle: (code: string, checked: boolean) => void;
};

function PermissionSelector({ permissions, selected, disabled = false, onToggle }: PermissionSelectorProps) {
  function toggleGroup(group: typeof permissionGroups[number]) {
    const items = getGroupPermissions(group, permissions);
    const allSelected = items.length > 0 && items.every(permission => selected.includes(permission.code));
    items.forEach(permission => onToggle(permission.code, !allSelected));
  }

  return (
    <div className="permission-groups">
      {permissionGroups.map(group => {
        const items = getGroupPermissions(group, permissions);
        if (!items.length) return null;
        const selectedCount = items.filter(permission => selected.includes(permission.code)).length;
        const allSelected = selectedCount === items.length;
        const partiallySelected = selectedCount > 0 && !allSelected;
        return (
          <section className="permission-group" key={group.key}>
            <div className="permission-group-heading">
              <label className="permission-group-master">
                <input type="checkbox" checked={allSelected}
                  ref={input => { if (input) input.indeterminate = partiallySelected; }}
                  disabled={disabled} onChange={() => toggleGroup(group)} />
                <span>{group.label}</span><small>{selectedCount}/{items.length}</small>
              </label>
              <button type="button" className="permission-group-toggle" disabled={disabled} onClick={() => toggleGroup(group)}>
                {allSelected ? 'إلغاء القسم' : 'تحديد القسم'}
              </button>
            </div>
            <div className="permission-group-items">
              {items.map(permission => (
                <label key={permission.code}>
                  <input type="checkbox" checked={selected.includes(permission.code)} disabled={disabled}
                    onChange={event => onToggle(permission.code, event.target.checked)} />
                  <span>{permission.name}</span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}


export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ displayName: '', staffType: 'doctor', email: '', phone: '', password: '', permissionCodes: [] as string[] });

  async function loadStaff() {
    setLoading(true); setError('');
    try {
      const result = await apiFetch<{ staff: StaffMember[] }>('/staff');
      setStaff(result.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الموظفين');
    } finally { setLoading(false); }
  }

  async function loadPermissions() {
    try {
      const result = await apiFetch<{ permissions: Permission[] }>('/staff/permissions');
      setPermissions(result.permissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الصلاحيات');
    }
  }

  useEffect(() => { void Promise.all([loadStaff(), loadPermissions()]); }, []);

  function togglePermission(code: string, checked: boolean, target: 'new' | 'existing') {
    if (target === 'new') {
      setForm(prev => ({ ...prev, permissionCodes: checked
        ? [...new Set([...prev.permissionCodes, code])]
        : prev.permissionCodes.filter(x => x !== code) }));
      return;
    }
    setSelectedPermissions(prev => checked ? [...new Set([...prev, code])] : prev.filter(x => x !== code));
  }

  function selectAll(target: 'new' | 'existing') {
    const codes = permissions.map(p => p.code);
    if (target === 'new') setForm(prev => ({ ...prev, permissionCodes: codes }));
    else setSelectedPermissions(codes);
  }

  function clearAll(target: 'new' | 'existing') {
    if (target === 'new') setForm(prev => ({ ...prev, permissionCodes: [] }));
    else setSelectedPermissions([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (form.password.length < 10) { setError('كلمة المرور يجب أن تكون 10 أحرف على الأقل'); return; }
    setSaving(true);
    try {
      await apiFetch<{ staff: StaffMember }>('/staff', {
        method: 'POST',
        body: JSON.stringify({
          displayName: form.displayName.trim(), staffType: form.staffType,
          email: form.email.trim(), phone: form.phone.trim(), password: form.password,
          permissionCodes: form.staffType === 'admin' ? permissions.map(p => p.code) : form.permissionCodes,
        }),
      });
      setForm({ displayName: '', staffType: 'doctor', email: '', phone: '', password: '', permissionCodes: [] });
      setSuccess('تم إنشاء حساب الموظف وحفظ الصلاحيات المحددة له.');
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب الموظف');
    } finally { setSaving(false); }
  }

  async function loadSelectedPermissions(staffId: string) {
    setSelectedStaffId(staffId); setError(''); setSuccess('');
    if (!staffId) { setSelectedPermissions([]); return; }
    try {
      const result = await apiFetch<{ permissionCodes: string[] }>(`/staff/${staffId}/permissions`);
      setSelectedPermissions(result.permissionCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل صلاحيات الموظف');
    }
  }

  async function saveSelectedPermissions() {
    if (!selectedStaffId) return;
    setPermissionSaving(true); setError(''); setSuccess('');
    try {
      await apiFetch(`/staff/${selectedStaffId}/permissions`, {
        method: 'PUT', body: JSON.stringify({ permissionCodes: selectedPermissions }),
      });
      setSuccess('تم تحديث صلاحيات الموظف. ستُطبق الصلاحيات الجديدة عند طلبه التالي للنظام.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث الصلاحيات');
    } finally { setPermissionSaving(false); }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><span className="eyebrow">إدارة الموظفين</span><h1>الموظفون والأطباء والأخصائيون</h1></div>
        <Link className="secondary-button" to="/admin/dashboard">العودة للوحة الإدارة</Link>
      </header>

      {(error || success) && <div className={error ? 'info-strip warning' : 'info-strip'} role={error ? 'alert' : 'status'}>{error || success}</div>}

      <section className="staff-management-grid">
        <section className="panel staff-form-panel">
          <p className="eyebrow">إنشاء حساب داخلي</p>
          <h2>إضافة موظف أو طبيب</h2>
          <p className="panel-description">حدد صلاحيات الموظف يدويًا. نوع الحساب يعرّف الموظف، أما الصلاحيات فهي التي تحدد ما يستطيع فعليًا تنفيذه.</p>
          <form onSubmit={submit} className="form-stack">
            <label>الاسم<input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required /></label>
            <label>نوع الحساب<select value={form.staffType} onChange={e => setForm({ ...form, staffType: e.target.value })} required>{staffTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>البريد الإلكتروني<input type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></label>
            <label>الجوال <span>(اختياري)</span><input type="tel" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+9665XXXXXXXX" autoComplete="tel" /></label>
            <label>كلمة المرور<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={10} autoComplete="new-password" required /><small>10 أحرف على الأقل.</small></label>

            <div className="panel-heading-row"><div><p className="eyebrow">الصلاحيات</p><h3>صلاحيات الحساب</h3></div><div className="portal-choice-actions"><button type="button" className="secondary-button" onClick={() => selectAll('new')} disabled={!permissions.length}>تحديد الكل</button><button type="button" className="secondary-button" onClick={() => clearAll('new')}>إلغاء الكل</button></div></div>
            {form.staffType === 'admin' && <div className="form-success">حساب الإدارة يحصل على الصلاحيات الكاملة تلقائيًا لحماية إدارة النظام.</div>}
            <PermissionSelector permissions={permissions}
              selected={form.staffType === 'admin' ? permissions.map(permission => permission.code) : form.permissionCodes}
              disabled={form.staffType === 'admin'}
              onToggle={(code, checked) => togglePermission(code, checked, 'new')} />
            <button className="primary-action button" type="submit" disabled={saving}>{saving ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}</button>
          </form>
        </section>

        <section className="panel staff-list-panel">
          <div className="panel-heading-row"><div><p className="eyebrow">الحسابات الداخلية</p><h2>قائمة الموظفين</h2></div><button className="secondary-button" type="button" onClick={() => void loadStaff()} disabled={loading}>تحديث</button></div>
          {loading ? <p className="empty-state">جارٍ تحميل الحسابات...</p> : !staff.length ? <p className="empty-state">لا توجد حسابات موظفين حتى الآن.</p> :
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الاسم</th><th>النوع</th><th>البريد</th><th>الحالة</th><th>الصلاحيات</th></tr></thead><tbody>
              {staff.map(member => <tr key={member.id}><td>{member.displayName}</td><td>{typeLabel[member.staffType] ?? member.staffType}</td><td dir="ltr">{member.email ?? '—'}</td><td>{member.active ? 'نشط' : 'موقوف'}</td><td><button className="secondary-button" type="button" onClick={() => void loadSelectedPermissions(member.id)}>تعديل الصلاحيات</button></td></tr>)}
            </tbody></table></div>}
        </section>
      </section>

      {selectedStaffId && <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">التحكم في الوصول</p><h2>تعديل صلاحيات الموظف</h2><p className="panel-description">{staff.find(x => x.id === selectedStaffId)?.displayName ?? ''}</p></div><div className="portal-choice-actions"><button type="button" className="secondary-button" onClick={() => clearAll('existing')}>إلغاء الكل</button><button type="button" className="secondary-button" onClick={() => selectAll('existing')}>تحديد الكل</button><button type="button" className="primary-action" onClick={() => void saveSelectedPermissions()} disabled={permissionSaving}>{permissionSaving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</button></div></div>
        <PermissionSelector permissions={permissions} selected={selectedPermissions}
          onToggle={(code, checked) => togglePermission(code, checked, 'existing')} />
      </section>}
    </main>
  );
}
