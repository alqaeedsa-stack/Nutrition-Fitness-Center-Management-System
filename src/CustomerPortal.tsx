import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from './lib/api';
import { LanguageSwitcher, useLanguage } from './i18n';

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
type StaffOption = { id: string; name: string; staffType: string };

type Props = { onLogout: () => void };

function EmptyModule({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default function CustomerPortal({ onLogout }: Props) {
  const navigate = useNavigate();
  const { language, isArabic } = useLanguage();
  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [nutritionPlans, setNutritionPlans] = useState<Plan[]>([]);
  const [fitnessPlans, setFitnessPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState('');
  const [error, setError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [bookingForm, setBookingForm] = useState({ staffId: '', appointmentType: '', date: '', startsAt: '', endsAt: '', notes: '' });

  const statusLabel: Record<string, string> = isArabic
    ? { draft: 'مسودة', active: 'نشطة', completed: 'مكتملة', cancelled: 'ملغاة', scheduled: 'مجدول', confirmed: 'مؤكد', pending: 'جديد', returned: 'مرتجع', partially_returned: 'مرتجع جزئي', no_show: 'لم يحضر' }
    : { draft: 'Draft', active: 'Active', completed: 'Completed', cancelled: 'Cancelled', scheduled: 'Scheduled', confirmed: 'Confirmed', pending: 'New', returned: 'Returned', partially_returned: 'Partially returned', no_show: 'No show' };

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [account, measurementsResult, nutrition, fitness, appointmentsResult, ordersResult, productsResult, options] = await Promise.all([
        apiFetch<{ customer: Customer }>('/customer-account/me'),
        apiFetch<{ measurements: Measurement[] }>('/customer-portal/measurements'),
        apiFetch<{ plans: Plan[] }>('/customer-portal/nutrition'),
        apiFetch<{ plans: Plan[] }>('/customer-portal/fitness'),
        apiFetch<{ appointments: Appointment[] }>('/customer-portal/appointments'),
        apiFetch<{ orders: any[] }>('/customer-portal/orders'),
        apiFetch<{ products: Product[] }>('/customer-portal/store/products'),
        apiFetch<{ staff: StaffOption[] }>('/customer-portal/appointment-options'),
      ]);
      setCustomer(account.customer);
      setMeasurements(measurementsResult.measurements);
      setNutritionPlans(nutrition.plans);
      setFitnessPlans(fitness.plans);
      setAppointments(appointmentsResult.appointments);
      setOrders(ordersResult.orders);
      setProducts(productsResult.products);
      setStaffOptions(options.staff);
      if (!bookingForm.staffId && options.staff[0]) setBookingForm(form => ({ ...form, staffId: options.staff[0].id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذر تحميل بيانات بوابة العميل.', 'Unable to load your portal data.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function logout() {
    try { await apiFetch<void>('/auth/logout', { method: 'POST' }); }
    finally { onLogout(); navigate('/customer', { replace: true }); }
  }

  const displayName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : t('العميل', 'Customer');
  const upcomingAppointments = useMemo(
    () => appointments.filter(a => new Date(a.startsAt).getTime() >= Date.now()).slice(0, 5),
    [appointments],
  );

  async function submitBooking(event: React.FormEvent) {
    event.preventDefault();
    setBookingError('');
    setBookingSuccess('');
    if (!bookingForm.staffId || !bookingForm.appointmentType || !bookingForm.date || !bookingForm.startsAt || !bookingForm.endsAt) {
      setBookingError(t('أكمل بيانات الحجز المطلوبة.', 'Complete the required booking fields.'));
      return;
    }

    const startsAt = new Date(`${bookingForm.date}T${bookingForm.startsAt}:00+03:00`);
    const endsAt = new Date(`${bookingForm.date}T${bookingForm.endsAt}:00+03:00`);
    if (endsAt <= startsAt) {
      setBookingError(t('وقت نهاية الموعد يجب أن يكون بعد وقت البداية.', 'The end time must be after the start time.'));
      return;
    }

    setBooking(true);
    try {
      await apiFetch('/customer-portal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          staffId: bookingForm.staffId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          appointmentType: bookingForm.appointmentType,
          notes: bookingForm.notes || null,
        }),
      });
      setBookingSuccess(t('تم إرسال طلب الحجز بنجاح.', 'Your appointment request was submitted successfully.'));
      setBookingForm(form => ({ ...form, appointmentType: '', date: '', startsAt: '', endsAt: '', notes: '' }));
      await load();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : t('تعذر إرسال طلب الحجز.', 'Unable to submit the appointment request.'));
    } finally {
      setBooking(false);
    }
  }

  async function cancelAppointment(id: string) {
    if (!window.confirm(t('هل تريد إلغاء هذا الموعد؟', 'Do you want to cancel this appointment?'))) return;
    setCancellingId(id);
    setError('');
    try {
      await apiFetch(`/customer-portal/appointments/${id}/cancel`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذر إلغاء الموعد.', 'Unable to cancel the appointment.'));
    } finally {
      setCancellingId('');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-inline">
          <div className="brand-mark">N</div>
          <div>
            <span className="eyebrow">{t('بوابة العملاء', 'Customer Portal')}</span>
            <h1>{t('بوابة العميل', 'Customer Portal')}</h1>
          </div>
        </div>
        <div className="header-actions">
          <LanguageSwitcher />
          <button className="secondary-button" onClick={logout}>{t('تسجيل الخروج', 'Log out')}</button>
        </div>
      </header>

      <section className="dashboard-intro">
        <p className="eyebrow">{t('مساحتي الشخصية', 'My account')}</p>
        <h2>{t('مرحبًا', 'Welcome')} {displayName}</h2>
        <p>{t('ملفك وقياساتك وخططك ومواعيدك ومشترياتك في مكان واحد.', 'Your profile, measurements, plans, appointments and purchases in one place.')}</p>
      </section>

      {loading && <div className="info-strip">{t('جارٍ تحميل بيانات حسابك...', 'Loading your account...')}</div>}
      {error && <div className="info-strip warning">{error}</div>}

      {customer && (
        <section className="customer-summary">
          <div><span className="eyebrow">{t('رقم العميل', 'Customer number')}</span><strong>{customer.customerNumber}</strong></div>
          <div><span className="eyebrow">{t('البريد الإلكتروني', 'Email')}</span><span dir="ltr">{customer.email || t('غير متوفر', 'Not available')}</span></div>
          <div><span className="eyebrow">{t('الجوال', 'Phone')}</span><span dir="ltr">{customer.phone || t('لم تتم إضافته', 'Not added')}</span></div>
        </section>
      )}

      <section className="module-card">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">{t('المواعيد', 'Appointments')}</span>
            <h2>{t('حجز وإدارة المواعيد', 'Book and manage appointments')}</h2>
          </div>
          <button className="primary-action" type="button" onClick={() => { setBookingOpen(v => !v); setBookingError(''); setBookingSuccess(''); }}>
            {bookingOpen ? t('إغلاق الحجز', 'Close booking') : t('حجز موعد', 'Book appointment')}
          </button>
        </div>

        {bookingOpen && (
          <form className="form-grid" onSubmit={submitBooking}>
            <label>
              <span>{t('المختص', 'Specialist')}</span>
              <select value={bookingForm.staffId} onChange={e => setBookingForm({ ...bookingForm, staffId: e.target.value })} required>
                <option value="">{t('اختر المختص', 'Select specialist')}</option>
                {staffOptions.map(staff => <option key={staff.id} value={staff.id}>{staff.name} — {staff.staffType}</option>)}
              </select>
            </label>
            <label>
              <span>{t('نوع الموعد', 'Appointment type')}</span>
              <input value={bookingForm.appointmentType} onChange={e => setBookingForm({ ...bookingForm, appointmentType: e.target.value })} placeholder={t('مثال: متابعة تغذية', 'Example: Nutrition follow-up')} required />
            </label>
            <label>
              <span>{t('التاريخ', 'Date')}</span>
              <input type="date" value={bookingForm.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })} required />
            </label>
            <label>
              <span>{t('من', 'Start')}</span>
              <input type="time" value={bookingForm.startsAt} onChange={e => setBookingForm({ ...bookingForm, startsAt: e.target.value })} required />
            </label>
            <label>
              <span>{t('إلى', 'End')}</span>
              <input type="time" value={bookingForm.endsAt} onChange={e => setBookingForm({ ...bookingForm, endsAt: e.target.value })} required />
            </label>
            <label className="form-field-wide">
              <span>{t('ملاحظات', 'Notes')}</span>
              <textarea value={bookingForm.notes} onChange={e => setBookingForm({ ...bookingForm, notes: e.target.value })} maxLength={2000} rows={3} />
            </label>
            <div className="form-actions form-field-wide">
              <button className="primary-action" type="submit" disabled={booking || !staffOptions.length}>
                {booking ? t('جارٍ إرسال الطلب...', 'Submitting...') : t('إرسال طلب الحجز', 'Submit booking request')}
              </button>
            </div>
            {bookingError && <div className="info-strip warning form-field-wide">{bookingError}</div>}
            {bookingSuccess && <div className="info-strip form-field-wide">{bookingSuccess}</div>}
          </form>
        )}

        <div className="portal-data-list">
          {upcomingAppointments.length ? upcomingAppointments.map(a => (
            <div className="portal-data-row" key={a.id}>
              <strong>{a.appointmentType}</strong>
              <span>{statusLabel[a.status] ?? a.status}</span>
              <small>{new Date(a.startsAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-SA')}</small>
              {['scheduled', 'confirmed'].includes(a.status) && (
                <button className="text-button" type="button" disabled={cancellingId === a.id} onClick={() => void cancelAppointment(a.id)}>
                  {cancellingId === a.id ? t('جارٍ الإلغاء...', 'Cancelling...') : t('إلغاء', 'Cancel')}
                </button>
              )}
            </div>
          )) : <EmptyModule text={t('لا توجد مواعيد قادمة.', 'No upcoming appointments.')} />}
        </div>
      </section>

      <section className="customer-store-entry">
        <div>
          <span className="eyebrow">{t('متجر العملاء', 'Customer store')}</span>
          <h2>{t('المتجر الإلكتروني', 'Online store')}</h2>
          <p>{products.length ? t(`متاح الآن ${products.length} منتج من كتالوج المركز.`, `${products.length} products are currently available.`) : t('لا توجد منتجات منشورة حاليًا في المتجر.', 'No products are currently published.')}</p>
        </div>
        <Link className="primary-action" to="/customer/store">{t('دخول المتجر', 'Open store')}</Link>
      </section>

      <section className="module-grid customer-live-grid">
        <article className="module-card">
          <span className="module-code">MEASUREMENTS</span><h3>{t('القياسات', 'Measurements')}</h3>
          {measurements.length ? <div className="portal-data-list">{measurements.slice(0, 5).map(m => <div className="portal-data-row" key={m.id}><strong>{m.typeName}</strong><span>{m.value} {m.unit || ''}</span><small>{new Date(m.measuredAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-SA')}</small></div>)}</div> : <EmptyModule text={t('لا توجد قياسات مسجلة حتى الآن.', 'No measurements recorded yet.')} />}
        </article>

        <article className="module-card">
          <span className="module-code">NUTRITION</span><h3>{t('الخطة الغذائية', 'Nutrition plan')}</h3>
          {nutritionPlans.length ? <div className="portal-data-list">{nutritionPlans.slice(0, 3).map(plan => <div className="portal-data-row" key={plan.id}><strong>{plan.title}</strong><span>{statusLabel[plan.status] ?? plan.status}</span><small>{plan.startDate}{plan.endDate ? ` — ${plan.endDate}` : ''}</small></div>)}</div> : <EmptyModule text={t('لا توجد خطة غذائية منشورة لك حتى الآن.', 'No nutrition plan has been published for you yet.')} />}
        </article>

        <article className="module-card">
          <span className="module-code">FITNESS</span><h3>{t('خطة اللياقة', 'Fitness plan')}</h3>
          {fitnessPlans.length ? <div className="portal-data-list">{fitnessPlans.slice(0, 3).map(plan => <div className="portal-data-row" key={plan.id}><strong>{plan.title}</strong><span>{statusLabel[plan.status] ?? plan.status}</span><small>{plan.startDate}{plan.endDate ? ` — ${plan.endDate}` : ''}</small></div>)}</div> : <EmptyModule text={t('لا توجد خطة لياقة منشورة لك حتى الآن.', 'No fitness plan has been published for you yet.')} />}
        </article>

        <article className="module-card">
          <span className="module-code">ORDERS</span><h3>{t('مشترياتي', 'My purchases')}</h3>
          {orders.length ? <div className="portal-data-list">{orders.slice(0, 5).map(order => <div className="portal-data-row" key={order.id}><strong>{order.saleNumber}</strong><span>{order.total} {t('ر.س', 'SAR')}</span><small>{statusLabel[order.status] ?? order.status} · {new Date(order.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-SA')}</small></div>)}</div> : <EmptyModule text={t('لا توجد مشتريات مسجلة لك حتى الآن.', 'No purchases recorded yet.')} />}
        </article>

        <article className="module-card">
          <span className="module-code">PROFILE</span><h3>{t('ملفي', 'My profile')}</h3>
          {customer ? <div className="portal-data-list"><div className="portal-data-row"><strong>{t('الاسم', 'Name')}</strong><span>{displayName}</span></div><div className="portal-data-row"><strong>{t('البريد', 'Email')}</strong><span dir="ltr">{customer.email || '—'}</span></div><div className="portal-data-row"><strong>{t('الجوال', 'Phone')}</strong><span dir="ltr">{customer.phone || '—'}</span></div></div> : <EmptyModule text={t('جارٍ تحميل الملف...', 'Loading profile...')} />}
        </article>
      </section>

      <footer className="app-footer">
        <span>{t('بوابة العميل', 'Customer Portal')}</span>
        <Link className="text-link" to="/customer/store">{t('المتجر الإلكتروني', 'Online store')}</Link>
      </footer>
    </main>
  );
}
