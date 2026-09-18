import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';
import './customers.css';

type Customer = {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  status: string;
  source?: string | null;
  notes?: string | null;
};

export default function Customers({ user }: { user: { staffType?: string | null; permissions?: string[] } }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const isAdmin = user.staffType === 'admin';
  const canCreate = isAdmin || (user.permissions ?? []).includes('customers.create');
  const canUpdate = isAdmin || (user.permissions ?? []).includes('customers.update');
  const canDelete = isAdmin || (user.permissions ?? []).includes('customers.delete');
  const [form, setForm] = useState({ customerNumber: '', firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', gender: '', source: '', notes: '' });

  async function loadCustomers(term = '') {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ customers: Customer[] }>(`/customers?limit=100${term ? `&search=${encodeURIComponent(term)}` : ''}`);
      setCustomers(result.customers);
    } catch {
      setError('تعذر تحميل العملاء. تحقق من اتصال خدمة النظام.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCustomers(); }, []);

  function startEdit(customer: Customer) {
    setEditing(customer);
    setShowForm(true);
    setForm({ customerNumber: customer.customerNumber, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone ?? '', email: customer.email ?? '', dateOfBirth: customer.dateOfBirth ?? '', gender: customer.gender ?? '', source: customer.source ?? '', notes: customer.notes ?? '' });
  }

  async function removeCustomer(customer: Customer) {
    if (!window.confirm(`هل تريد حذف العميل ${customer.firstName} ${customer.lastName}؟`)) return;
    setError('');
    try {
      await apiFetch(`/customers/${customer.id}`, { method: 'DELETE' });
      await loadCustomers(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف العميل. قد توجد بيانات مرتبطة به.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await apiFetch<{ customer: Customer }>(`/customers/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await apiFetch<{ customer: Customer }>('/customers', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm({ customerNumber: '', firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', gender: '', source: '', notes: '' });
      setShowForm(false);
      setEditing(null);
      await loadCustomers(search);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('409') ? 'رقم العميل مستخدم بالفعل أو توجد بيانات مرتبطة به.' : 'تعذر حفظ العميل. تحقق من البيانات.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><p className="eyebrow">Customer 360</p><h1>العملاء</h1></div>
        <div className="header-actions">
          <Link className="secondary-button" to="/dashboard">لوحة التحكم</Link>
          {canCreate && <button className="primary-action button" onClick={() => { setEditing(null); setShowForm((value) => !value); }}>{showForm ? 'إغلاق' : 'عميل جديد'}</button>}
        </div>
      </header>

      <section className="dashboard-intro compact">
        <h2>ملف العملاء</h2>
        <p>ابحث عن العملاء وأدر بياناتهم الأساسية من داخل المركز.</p>
      </section>

      {showForm && (
        <section className="panel customer-form-panel">
          <div className="section-heading left"><span className="eyebrow">{editing ? 'تعديل العميل' : 'إضافة عميل'}</span><h2>{editing ? 'تعديل بيانات العميل' : 'بيانات العميل الأساسية'}</h2></div>
          <form onSubmit={submit} className="customer-form">
            <label>رقم العميل<input value={form.customerNumber} onChange={(e) => setForm({ ...form, customerNumber: e.target.value })} required /></label>
            <label>الاسم الأول<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
            <label>اسم العائلة<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
            <label>الجوال<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
            <label>البريد الإلكتروني<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>تاريخ الميلاد<input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
            <label>الجنس<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">غير محدد</option><option value="male">ذكر</option><option value="female">أنثى</option></select></label>
            <label>مصدر العميل<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
            <label className="wide-field">ملاحظات<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="wide-field form-actions"><button className="primary-action button" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'حفظ العميل'}</button></div>
          </form>
        </section>
      )}

      {error && <div className="info-strip warning">{error}</div>}

      <section className="panel customers-panel">
        <div className="customer-toolbar">
          <input aria-label="البحث عن عميل" placeholder="ابحث بالاسم أو الجوال أو رقم العميل" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCustomers(search); }} />
          <button className="secondary-button" onClick={() => void loadCustomers(search)}>بحث</button>
        </div>
        {loading ? <p className="empty-state">جارٍ تحميل العملاء...</p> : customers.length === 0 ? <p className="empty-state">لا يوجد عملاء مطابقون للبحث.</p> : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead><tr><th>رقم العميل</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th>إجراء</th></tr></thead>
              <tbody>{customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.customerNumber}</td>
                  <td><strong>{customer.firstName} {customer.lastName}</strong></td>
                  <td dir="ltr">{customer.phone}</td>
                  <td>{customer.email ?? '—'}</td>
                  <td><span className="active-dot">{customer.status === 'active' ? 'نشط' : customer.status}</span></td>
                  <td><div className="header-actions"><Link className="secondary-button" to={`/admin/customers/${customer.id}`}>الملف الكامل</Link>{canUpdate && <button className="secondary-button" type="button" onClick={() => startEdit(customer)}>تعديل</button>}{canDelete && <button className="secondary-button" type="button" onClick={() => void removeCustomer(customer)}>حذف</button>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
