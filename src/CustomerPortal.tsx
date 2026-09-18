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

type Measurement = { id: string; value: string; measuredAt: string; notes?: string | null; typeName: string; unit?: string | null };
type Plan = { id: string; title: string; goals?: string | null; startDate: string; endDate?: string | null; status: string; version: number; items?: any[]; exercises?: any[] };
type Appointment = { id: string; startsAt: string; endsAt: string; appointmentType: string; status: string; notes?: string | null };
type Product = { id: string; sku: string; name: string; sellingPrice: string; taxCode?: string | null };

type Props = { onLogout: () => void };

function EmptyModule({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default function CustomerPortal({ onLogout }: Props) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [nutritionPlans, setNutritionPlans] = useState<Plan[]>([]);
  const [fitnessPlans, setFitnessPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [account, measurementsResult, nutrition, fitness, appointmentsResult, ordersResult, productsResult] = await Promise.all([
          apiFetch<{ customer: Customer }>('/customer-account/me'),
          apiFetch<{ measurements: Measurement[] }>('/customer-portal/measurements'),
          apiFetch<{ plans: Plan[] }>('/customer-portal/nutrition'),
          apiFetch<{ plans: Plan[] }>('/customer-portal/fitness'),
          apiFetch<{ appointments: Appointment[] }>('/customer-portal/appointments'),
          apiFetch<{ orders: any[] }>('/customer-portal/orders'),
          apiFetch<{ products: Product[] }>('/customer-portal/store/products'),
        ]);
        setCustomer(account.customer);
        setMeasurements(measurementsResult.measurements);
        setNutritionPlans(nutrition.plans);
        setFitnessPlans(fitness.plans);
        setAppointments(appointmentsResult.appointments);
        setOrders(ordersResult.orders);
        setProducts(productsResult.products);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات بوابة العميل.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function logout() {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
      navigate('/customer', { replace: true });
    }
  }

  const displayName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'العميل';
  const upcomingAppointments = appointments.filter(a => new Date(a.startsAt).getTime() >= Date.now()).slice(0, 5);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-inline">
          <div className="brand-mark">N</div>
          <div>
            <span className="eyebrow">CUSTOMER PORTAL</span>
            <h1>بوابة العميل</h1>
          </div>
        </div>
        <button className="secondary-button" onClick={logout}>تسجيل الخروج</button>
      </header>

      <section className="dashboard-intro">
        <p className="eyebrow">مساحتي الشخصية</p>
        <h2>مرحبًا {displayName}</h2>
        <p>كل ما يخصك في مكان واحد: ملفك، قياساتك، خططك، مواعيدك ومشترياتك.</p>
      </section>

      {loading && <div className="info-strip">جارٍ تحميل بيانات حسابك...</div>}
      {error && <div className="info-strip warning">{error}</div>}

      {customer && (
        <section className="customer-summary">
          <div><span className="eyebrow">رقم العميل</span><strong>{customer.customerNumber}</strong></div>
          <div><span className="eyebrow">البريد الإلكتروني</span><span dir="ltr">{customer.email || 'غير متوفر'}</span></div>
          <div><span className="eyebrow">الجوال</span><span dir="ltr">{customer.phone || 'لم تتم إضافته'}</span></div>
        </section>
      )}

      <section className="customer-store-entry">
        <div>
          <span className="eyebrow">CUSTOMER STORE</span>
          <h2>المتجر الإلكتروني</h2>
          <p>{products.length ? `متاح الآن ${products.length} منتج من كتالوج المركز.` : 'لا توجد منتجات منشورة حاليًا في المتجر.'}</p>
        </div>
        <Link className="primary-action" to="/customer/store">دخول المتجر</Link>
      </section>

      <section className="module-grid customer-live-grid">
        <article className="module-card">
          <span className="module-code">MEASUREMENTS</span>
          <h3>القياسات</h3>
          {measurements.length ? (
            <div className="portal-data-list">{measurements.slice(0, 5).map(m => (
              <div className="portal-data-row" key={m.id}><strong>{m.typeName}</strong><span>{m.value} {m.unit || ''}</span><small>{new Date(m.measuredAt).toLocaleDateString('ar-SA')}</small></div>
            ))}</div>
          ) : <EmptyModule text="لا توجد قياسات مسجلة حتى الآن." />}
        </article>

        <article className="module-card">
          <span className="module-code">NUTRITION</span>
          <h3>الخطة الغذائية</h3>
          {nutritionPlans.length ? (
            <div className="portal-data-list">{nutritionPlans.slice(0, 3).map(plan => (
              <div className="portal-data-row" key={plan.id}><strong>{plan.title}</strong><span>{plan.status}</span><small>{plan.startDate}{plan.endDate ? ` — ${plan.endDate}` : ''}</small></div>
            ))}</div>
          ) : <EmptyModule text="لا توجد خطة غذائية منشورة لك حتى الآن." />}
        </article>

        <article className="module-card">
          <span className="module-code">FITNESS</span>
          <h3>خطة اللياقة</h3>
          {fitnessPlans.length ? (
            <div className="portal-data-list">{fitnessPlans.slice(0, 3).map(plan => (
              <div className="portal-data-row" key={plan.id}><strong>{plan.title}</strong><span>{plan.status}</span><small>{plan.startDate}{plan.endDate ? ` — ${plan.endDate}` : ''}</small></div>
            ))}</div>
          ) : <EmptyModule text="لا توجد خطة لياقة منشورة لك حتى الآن." />}
        </article>

        <article className="module-card">
          <span className="module-code">APPOINTMENTS</span>
          <h3>المواعيد القادمة</h3>
          {upcomingAppointments.length ? (
            <div className="portal-data-list">{upcomingAppointments.map(a => (
              <div className="portal-data-row" key={a.id}><strong>{a.appointmentType}</strong><span>{a.status}</span><small>{new Date(a.startsAt).toLocaleString('ar-SA')}</small></div>
            ))}</div>
          ) : <EmptyModule text="لا توجد مواعيد قادمة مسجلة لك." />}
        </article>

        <article className="module-card">
          <span className="module-code">ORDERS</span>
          <h3>مشترياتي</h3>
          {orders.length ? (
            <div className="portal-data-list">{orders.slice(0, 5).map(order => (
              <div className="portal-data-row" key={order.id}><strong>{order.saleNumber}</strong><span>{order.total} ر.س</span><small>{order.status} · {new Date(order.createdAt).toLocaleDateString('ar-SA')}</small></div>
            ))}</div>
          ) : <EmptyModule text="لا توجد مشتريات مسجلة لك حتى الآن." />}
        </article>

        <article className="module-card">
          <span className="module-code">PROFILE</span>
          <h3>ملفي</h3>
          {customer ? (
            <div className="portal-data-list">
              <div className="portal-data-row"><strong>الاسم</strong><span>{displayName}</span></div>
              <div className="portal-data-row"><strong>البريد</strong><span dir="ltr">{customer.email || '—'}</span></div>
              <div className="portal-data-row"><strong>الجوال</strong><span dir="ltr">{customer.phone || '—'}</span></div>
            </div>
          ) : <EmptyModule text="جارٍ تحميل الملف..." />}
        </article>
      </section>

      <footer className="app-footer">
        <span>بوابة العميل</span>
        <Link className="text-link" to="/customer/store">المتجر الإلكتروني</Link>
      </footer>
    </main>
  );
}
