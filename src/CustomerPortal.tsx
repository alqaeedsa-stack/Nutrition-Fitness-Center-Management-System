import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './lib/api';

type Customer = {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  status: string;
};

type CustomerAccountResponse = {
  account: { id: string; customerId: string; userId: string; status: string; createdAt: string; updatedAt: string };
  customer: Customer;
};

type Props = { onLogout: () => void };

export default function CustomerPortal({ onLogout }: Props) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<CustomerAccountResponse>('/customer-account/me')
      .then((result) => setCustomer(result.customer))
      .catch(() => setError('تعذر تحميل ملف العميل حاليًا.'))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
      navigate('/login', { replace: true });
    }
  }

  const displayName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'العميل';

  const sections = [
    ['ملفي', 'بياناتي الأساسية وبيانات التواصل.', 'profile'],
    ['القياسات', 'متابعة القياسات والتغيرات المسجلة لك.', 'measurements'],
    ['الخطة الغذائية', 'عرض خطتك الغذائية والتعليمات المرتبطة بها.', 'nutrition'],
    ['خطة اللياقة', 'عرض خطة التدريب واللياقة الخاصة بك.', 'fitness'],
    ['المواعيد', 'مواعيدك القادمة وسجل المواعيد.', 'appointments'],
    ['مشترياتي', 'متابعة الطلبات والمشتريات من المتجر.', 'orders'],
  ] as const;

  return <main className="app-shell">
    <header className="app-header">
      <div className="brand-inline">
        <div className="brand-mark">N</div>
        <div>
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1>بوابة العميل</h1>
        </div>
      </div>
      <button className="secondary-button" onClick={logout}>تسجيل الخروج</button>
    </header>

    <section className="dashboard-intro">
      <p className="eyebrow">مساحتي الشخصية</p>
      <h2>مرحبًا {displayName}</h2>
      <p>هنا تتابع ملفك وقياساتك وخططك ومواعيدك ومشترياتك. هذه المساحة خاصة بك ولا تحتوي على أدوات إدارة المركز.</p>
    </section>

    {loading && <div className="info-strip">جارٍ تحميل ملفك...</div>}
    {error && <div className="info-strip warning">{error}</div>}

    {customer && <section className="customer-summary">
      <div><span className="eyebrow">ملف العميل</span><strong>{displayName}</strong></div>
      <div><span className="eyebrow">البريد الإلكتروني</span><span dir="ltr">{customer.email || 'غير متوفر'}</span></div>
      <div><span className="eyebrow">الجوال</span><span dir="ltr">{customer.phone || 'لم تتم إضافته'}</span></div>
    </section>}

    <section className="module-grid" aria-label="مساحة العميل">
      {sections.map(([title, description, key]) => (
        <article className="module-card" key={key}>
          <span className="module-code">{key}</span>
          <h3>{title}</h3>
          <p>{description}</p>
          <span className="module-status">متاح قريبًا</span>
        </article>
      ))}
    </section>

    <footer className="app-footer">
      <span>بوابة العميل</span>
      <Link className="text-link" to="/">العودة للرئيسية</Link>
    </footer>
  </main>;
}
