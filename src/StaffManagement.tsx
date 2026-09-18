import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type StaffMember = {
  id: string;
  userId: string;
  displayName: string;
  staffType: string;
  active: boolean;
  email?: string | null;
  phone?: string | null;
  createdAt?: string;
};

const staffTypes = [
  ['admin', 'إدارة'],
  ['doctor', 'طبيب'],
  ['nutritionist', 'أخصائي تغذية'],
  ['trainer', 'مدرب'],
  ['employee', 'موظف'],
  ['cashier', 'كاشير'],
  ['warehouse', 'مخازن'],
] as const;

const typeLabel = Object.fromEntries(staffTypes);

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    displayName: '',
    staffType: 'doctor',
    email: '',
    phone: '',
    password: '',
  });

  async function loadStaff() {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ staff: StaffMember[] }>('/staff');
      setStaff(result.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStaff();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (form.password.length < 10) {
      setError('كلمة المرور يجب أن تكون 10 أحرف على الأقل');
      return;
    }

    setSaving(true);
    try {
      await apiFetch<{ staff: StaffMember }>('/staff', {
        method: 'POST',
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          staffType: form.staffType,
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
        }),
      });

      setForm({ displayName: '', staffType: 'doctor', email: '', phone: '', password: '' });
      setSuccess('تم إنشاء حساب الموظف. يمكنه الآن الدخول من بوابة الإدارة والموظفين.');
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب الموظف');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">STAFF MANAGEMENT</span>
          <h1>الموظفون والأطباء والأخصائيون</h1>
        </div>
        <Link className="secondary-button" to="/admin/dashboard">العودة للوحة الإدارة</Link>
      </header>

      <section className="staff-management-grid">
        <section className="panel staff-form-panel">
          <p className="eyebrow">إنشاء حساب داخلي</p>
          <h2>إضافة موظف أو طبيب</h2>
          <p className="panel-description">حسابات الموظفين لا يتم تسجيلها من واجهة العملاء. الإدارة تنشئ البريد وكلمة المرور من هنا.</p>

          <form onSubmit={submit} className="form-stack">
            <label>
              الاسم
              <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required />
            </label>
            <label>
              نوع الحساب
              <select value={form.staffType} onChange={e => setForm({ ...form, staffType: e.target.value })} required>
                {staffTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              البريد الإلكتروني
              <input type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
            </label>
            <label>
              الجوال <span>(اختياري)</span>
              <input type="tel" dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+9665XXXXXXXX" autoComplete="tel" />
            </label>
            <label>
              كلمة المرور
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={10} autoComplete="new-password" required />
              <small>10 أحرف على الأقل. كلمة المرور يحددها مسؤول الإدارة عند إنشاء الحساب.</small>
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}
            {success && <div className="form-success" role="status">{success}</div>}

            <button className="primary-action button" type="submit" disabled={saving}>
              {saving ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
            </button>
          </form>
        </section>

        <section className="panel staff-list-panel">
          <div className="panel-heading-row">
            <div>
              <p className="eyebrow">الحسابات الداخلية</p>
              <h2>قائمة الموظفين</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadStaff()} disabled={loading}>تحديث</button>
          </div>

          {loading ? (
            <p className="empty-state">جارٍ تحميل الحسابات...</p>
          ) : staff.length === 0 ? (
            <p className="empty-state">لا توجد حسابات موظفين حتى الآن.</p>
          ) : (
            <div className="staff-table-wrap">
              <table className="staff-table">
                <thead>
                  <tr><th>الاسم</th><th>النوع</th><th>البريد</th><th>الجوال</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {staff.map(member => (
                    <tr key={member.id}>
                      <td>{member.displayName}</td>
                      <td>{typeLabel[member.staffType] ?? member.staffType}</td>
                      <td dir="ltr">{member.email ?? '—'}</td>
                      <td dir="ltr">{member.phone ?? '—'}</td>
                      <td>{member.active ? 'نشط' : 'موقوف'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
