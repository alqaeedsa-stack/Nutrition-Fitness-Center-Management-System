import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';
import { useLanguage } from './i18n';
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
  const { language } = useLanguage();
  const en = language === 'en';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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

  async function loadCustomers(term = search, status = statusFilter) {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ customers: Customer[] }>(`/customers?limit=100${term ? `&search=${encodeURIComponent(term)}` : ''}${status ? `&status=${encodeURIComponent(status)}` : ''}`);
      setCustomers(result.customers);
    } catch {
      setError('تعذر تحميل العملاء. تحقق من اتصال خدمة النظام.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCustomers(); }, []);

  // بحث لحظي أثناء الكتابة مع تأخير قصير لتقليل طلبات API.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { void loadCustomers(search, statusFilter); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, statusFilter]);

  function startEdit(customer: Customer) {
    setEditing(customer);
    setShowForm(true);
    setForm({ customerNumber: customer.customerNumber, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone ?? '', email: customer.email ?? '', dateOfBirth: customer.dateOfBirth ?? '', gender: customer.gender ?? '', source: customer.source ?? '', notes: customer.notes ?? '' });
  }

  async function removeCustomer(customer: Customer) {
    if (!window.confirm(`هل تريد {en ? 'Deactivate' : 'تعطيل'} العميل ${customer.firstName} ${customer.lastName}؟`)) return;
    setError('');
    try {
      await apiFetch(`/customers/${customer.id}`, { method: 'DELETE' });
      await loadCustomers(search, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر {en ? 'Deactivate' : 'تعطيل'} العميل.');
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
        await apiFetch<{ customer: Customer }>('/customers', { method: 'POST', body: JSON.stringify({ ...form, customerNumber: undefined }) });
      }
      setForm({ customerNumber: '', firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', gender: '', source: '', notes: '' });
      setShowForm(false);
      setEditing(null);
      await loadCustomers(search);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('409') ? '{en ? 'Customer Number' : 'رقم العميل'} مستخدم بالفعل أو توجد بيانات مرتبطة به.' : 'تعذر {en ? 'Save Customer' : 'حفظ العميل'}. تحقق من البيانات.');
    } finally {
      setSaving(false);
    }
  }

  const activeCount = customers.filter((customer) => customer.status === 'active').length;
  const inactiveCount = customers.filter((customer) => customer.status !== 'active').length;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><p className="eyebrow">{en ? 'Customer Management' : 'إدارة العملاء'}</p><h1>{en ? 'Customers' : 'العملاء'}</h1></div>
        <div className="header-actions">
          <Link className="secondary-button" to="/admin/dashboard">{en ? 'Dashboard' : 'لوحة التحكم'}</Link>
          {canCreate && <button className="primary-action button" onClick={() => { setEditing(null); setShowForm((value) => !value); }}>{showForm ? '{en ? 'Close' : 'إغلاق'}' : '{en ? 'New Customer' : 'عميل جديد'}'}</button>}
        </div>
      </header>

      <section className="dashboard-intro compact">
        <h2>ملف العملاء</h2>
        <p>ابحث عن العملاء وأدر بياناتهم الأساسية من داخل المركز.</p>
      </section>

      {showForm && (
        <section className="panel customer-form-panel">
          <div className="section-heading left"><span className="eyebrow">{editing ? '{editing ? (en ? 'Edit Customer' : '{en ? 'Edit' : 'تعديل'} العميل') : (en ? 'Add Customer' : 'إضافة عميل')}' : 'إضافة عميل'}</span><h2>{editing ? (en ? 'Edit Customer' : '{en ? 'Edit' : 'تعديل'} بيانات العميل') : (en ? 'Basic Customer Information' : 'بيانات العميل الأساسية')}</h2></div>
          <form onSubmit={submit} className="customer-form">
            <label>{en ? 'Customer Number' : 'رقم العميل'}<input value={editing?.customerNumber ?? ''} readOnly placeholder="{en ? 'Generated automatically when saved' : 'يُنشأ تلقائيًا عند {en ? 'Save Customer' : 'حفظ العميل'}'}" /><small>{en ? 'Generated automatically and cannot be entered manually.' : 'يتم إنشاء رقم تسلسلي تلقائيًا ولا يمكن إدخاله يدويًا.'}</small></label>
            <label>{en ? 'First Name' : '{en ? 'Name' : 'الاسم'} الأول'}<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
            <label>{en ? 'Last Name' : 'اسم العائلة'}<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
            <label>{en ? 'Phone' : 'الجوال'}<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
            <label>{en ? 'Email' : 'البريد الإلكتروني'}<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>{en ? 'Date of Birth' : 'تاريخ الميلاد'}<input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></label>
            <label>{en ? 'Gender' : 'الجنس'}<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">{en ? 'Not specified' : 'غير محدد'}</option><option value="male">{en ? 'Male' : 'ذكر'}</option><option value="female">{en ? 'Female' : 'أنثى'}</option></select></label>
            <label>{en ? 'Customer Source' : 'مصدر العميل'}<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
            <label className="wide-field">{en ? 'Notes' : 'ملاحظات'}<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="wide-field form-actions"><button className="primary-action button" type="submit" disabled={saving}>{saving ? '{en ? 'Saving...' : 'جارٍ الحفظ...'}' : editing ? '{en ? 'Save Changes' : 'حفظ ال{en ? 'Edit' : 'تعديل'}ات'}' : '{en ? 'Save Customer' : 'حفظ العميل'}'}</button></div>
          </form>
        </section>
      )}

      {error && <div className="info-strip warning">{error}</div>}

      <section className="customer-stats-grid">
        <div className="customer-stat"><span>{en ? 'Total Customers' : 'إجمالي العملاء'}</span><strong>{customers.length}</strong></div>
        <div className="customer-stat"><span>{en ? 'Active Customers' : 'العملاء ال{en ? 'Active' : 'نشط'}ون'}</span><strong>{activeCount}</strong></div>
        <div className="customer-stat"><span>{en ? 'Inactive' : 'غير ال{en ? 'Active' : 'نشط'}ين'}</span><strong>{inactiveCount}</strong></div>
      </section>

      <section className="panel customers-panel">
        <div className="customer-toolbar">
          <input aria-label="البحث عن عميل" placeholder="ابحث ب{en ? 'Name' : 'الاسم'} أو {en ? 'Phone' : 'الجوال'} أو {en ? 'Customer Number' : 'رقم العميل'}" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="تصفية حالة العميل" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); void loadCustomers(search, e.target.value); }}>
            <option value="">{en ? 'All Statuses' : 'كل الحالات'}</option><option value="active">{en ? 'Active' : 'نشط'}</option><option value="inactive">غير {en ? 'Active' : 'نشط'}</option>
          </select>
          <span className="live-search-status">{loading ? '{en ? 'Updating...' : 'جاري التحديث...'}' : '{en ? 'Live update' : 'تحديث لحظي'}'}</span>
        </div>
        {loading ? <p className="empty-state">{en ? 'Loading customers...' : 'جارٍ تحميل العملاء...'}</p> : customers.length === 0 ? <p className="empty-state">{en ? 'No matching customers.' : 'لا يوجد عملاء مطابقون للبحث.'}</p> : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead><tr><th>{en ? 'Customer Number' : 'رقم العميل'}</th><th>{en ? 'Name' : 'الاسم'}</th><th>{en ? 'Phone' : 'الجوال'}</th><th>البريد</th><th>{en ? 'Status' : 'الحالة'}</th><th>{en ? 'Actions' : 'إجراء'}</th></tr></thead>
              <tbody>{customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.customerNumber}</td>
                  <td><strong>{customer.firstName} {customer.lastName}</strong></td>
                  <td dir="ltr">{customer.phone}</td>
                  <td>{customer.email ?? '—'}</td>
                  <td><span className={`status-badge ${customer.status === 'active' ? 'active' : 'inactive'}`}>{customer.status === 'active' ? '{en ? 'Active' : 'نشط'}' : 'غير {en ? 'Active' : 'نشط'}'}</span></td>
                  <td><div className="header-actions"><Link className="secondary-button" to={`/admin/customers/${customer.id}`}>{en ? 'Full Profile' : 'الملف الكامل'}</Link>{canUpdate && <button className="secondary-button" type="button" onClick={() => startEdit(customer)}>{en ? 'Edit' : 'تعديل'}</button>}{canDelete && <button className="secondary-button" type="button" onClick={() => void removeCustomer(customer)}>{en ? 'Deactivate' : 'تعطيل'}</button>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
