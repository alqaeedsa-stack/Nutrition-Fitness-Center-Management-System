import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from './lib/api';

type Customer = {
  id: string; customerNumber: string; firstName: string; lastName: string; phone?: string | null;
  email?: string | null; dateOfBirth?: string | null; gender?: string | null; status: string; source?: string | null; notes?: string | null;
};
type Measurement = { id: string; value: string; measuredAt: string; notes?: string | null; typeName: string; unit?: string | null };
type Plan = { id: string; title: string; goals?: string | null; startDate: string; endDate?: string | null; status: string; version: number; specialistName?: string | null };
type FollowUp = { id: string; followUpAt: string; nextFollowUpAt?: string | null; weight?: string | null; height?: string | null; adherenceScore?: number | null; nutritionAdherenceScore?: number | null; fitnessAdherenceScore?: number | null; notes?: string | null; recommendations?: string | null; staffName?: string | null };
type Appointment = { id: string; startsAt: string; endsAt: string; appointmentType: string; status: string; notes?: string | null; staffName?: string | null };
type Sale = { id: string; saleNumber: string; status: string; subtotal: string; discount: string; tax: string; total: string; paymentStatus: string; createdAt: string };
type Data = { customer: Customer; measurements: Measurement[]; nutrition: Plan[]; fitness: Plan[]; appointments: Appointment[]; sales: Sale[]; followUps: FollowUp[] };

const statusLabel: Record<string, string> = {
  active: 'نشطة', draft: 'مسودة', completed: 'مكتملة', cancelled: 'ملغاة', scheduled: 'مجدول',
  confirmed: 'مؤكد', no_show: 'لم يحضر', pending: 'قيد المعالجة', completed_sale: 'مكتمل',
};
function label(value: string) { return statusLabel[value] ?? value; }

export default function Customer360() {
  const { id } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const result = await apiFetch<Data>(`/customers/${id}/360`);
      setData(result);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل ملف العميل.');
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // تحديث تلقائي كل 10 ثوانٍ، وكذلك عند عودة الموظف إلى نافذة النظام.
  useEffect(() => {
    const timer = window.setInterval(() => { void load(true); }, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (loading) return <main className="app-shell"><div className="info-strip">جارٍ تحميل ملف العميل...</div></main>;
  if (error || !data) return <main className="app-shell"><div className="info-strip warning">{error || 'العميل غير موجود.'}</div><Link className="secondary-button" to="/admin/customers">العودة إلى العملاء</Link></main>;

  const { customer, measurements, nutrition, fitness, appointments, sales, followUps } = data;
  const upcoming = appointments.filter(a => new Date(a.startsAt).getTime() >= Date.now()).slice(0, 5);
  const nextAppointment = upcoming[0];
  const latestFollowUp = followUps[0];
  const latestWeight = latestFollowUp?.weight ?? null;
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1>{customer.firstName} {customer.lastName}</h1>
          <p>{customer.customerNumber} · {customer.status === 'active' ? 'عميل نشط' : label(customer.status)}</p>
        </div>
        <div className="header-actions">
          <span className="live-search-status">{refreshing ? 'جاري التحديث...' : 'تحديث تلقائي'}</span>
          <button className="secondary-button" type="button" onClick={() => void load(true)}>تحديث الآن</button>
          <Link className="secondary-button" to="/admin/customers">العملاء</Link>
          <Link className="secondary-button" to="/admin/dashboard">لوحة التحكم</Link>
        </div>
      </header>

      <section className="customer-action-bar">
        <div className="customer-action-title"><span className="eyebrow">إجراءات سريعة</span><strong>ماذا تريد أن تفعل بهذا العميل؟</strong></div>
        <div className="customer-action-links">
          {customer.phone && <a className="primary-action" href={`tel:${customer.phone}`}>اتصال</a>}
          {customer.phone && <a className="secondary-button" href={`https://wa.me/${customer.phone.replace(/\\D/g, '')}`} target="_blank" rel="noreferrer">واتساب</a>}
          <Link className="secondary-button" to="/admin/follow-ups">متابعة جديدة</Link>
          <Link className="secondary-button" to="/admin/measurements">إضافة قياس</Link>
          <Link className="secondary-button" to="/admin/nutrition">خطة غذائية</Link>
          <Link className="secondary-button" to="/admin/fitness">خطة لياقة</Link>
          <Link className="secondary-button" to="/admin/appointments">موعد</Link>
        </div>
      </section>

      <section className="customer-kpi-grid">
        <div className="customer-kpi"><span>آخر وزن مسجل</span><strong>{latestWeight ? `${latestWeight} كجم` : '—'}</strong></div>
        <div className="customer-kpi"><span>المتابعات</span><strong>{followUps.length}</strong></div>
        <div className="customer-kpi"><span>المواعيد القادمة</span><strong>{upcoming.length}</strong></div>
        <div className="customer-kpi"><span>إجمالي المشتريات</span><strong>{totalSales.toFixed(2)} ر.س</strong></div>
      </section>

      <section className="customer-next-appointment">
        <div><span className="eyebrow">NEXT APPOINTMENT</span><strong>{nextAppointment ? nextAppointment.appointmentType : 'لا يوجد موعد قادم'}</strong></div>
        <span>{nextAppointment ? new Date(nextAppointment.startsAt).toLocaleString('ar-SA') : 'يمكن إنشاء موعد من الإجراءات السريعة'}</span>
      </section>

      <section className="customer-summary">
        <div><span className="eyebrow">رقم العميل</span><strong>{customer.customerNumber}</strong></div>
        <div><span className="eyebrow">الجوال</span><span dir="ltr">{customer.phone || '—'}</span></div>
        <div><span className="eyebrow">البريد الإلكتروني</span><span dir="ltr">{customer.email || '—'}</span></div>
        <div><span className="eyebrow">تاريخ الميلاد</span><span>{customer.dateOfBirth || '—'}</span></div>
        <div><span className="eyebrow">الجنس</span><span>{customer.gender === 'male' ? 'ذكر' : customer.gender === 'female' ? 'أنثى' : '—'}</span></div>
        <div><span className="eyebrow">مصدر العميل</span><span>{customer.source || '—'}</span></div>
      </section>

      {customer.notes && <section className="panel"><div className="section-heading left"><span className="eyebrow">ملاحظات</span><h2>ملاحظات العميل</h2></div><p>{customer.notes}</p></section>}

      <section className="module-grid customer-live-grid">
        <article className="module-card"><span className="module-code">FOLLOW-UP</span><h3>المتابعات الدورية</h3>
          {followUps.length ? <div className="portal-data-list">{followUps.slice(0, 5).map(f => <div className="portal-data-row" key={f.id}><strong>{new Date(f.followUpAt).toLocaleDateString('ar-SA')}</strong><span>{f.weight ? f.weight + ' كجم' : '—'}{f.adherenceScore == null ? '' : ' · ' + f.adherenceScore + '%'}</span><small>{f.staffName || '—'}{f.nextFollowUpAt ? ' · التالية ' + new Date(f.nextFollowUpAt).toLocaleDateString('ar-SA') : ''}</small></div>)}</div> : <div className="empty-state">لا توجد متابعات.</div>}
          <Link className="text-link" to="/admin/follow-ups">إدارة المتابعات</Link>
        </article>
        <article className="module-card"><span className="module-code">MEASUREMENTS</span><h3>آخر القياسات</h3>
          {measurements.length ? <div className="portal-data-list">{measurements.slice(0, 8).map(m => <div className="portal-data-row" key={m.id}><strong>{m.typeName}</strong><span>{m.value} {m.unit || ''}</span><small>{new Date(m.measuredAt).toLocaleString('ar-SA')}</small></div>)}</div> : <div className="empty-state">لا توجد قياسات.</div>}
          <Link className="text-link" to="/admin/measurements">إدارة القياسات</Link>
        </article>
        <article className="module-card"><span className="module-code">NUTRITION</span><h3>الخطط الغذائية</h3>
          {nutrition.length ? <div className="portal-data-list">{nutrition.slice(0, 5).map(p => <div className="portal-data-row" key={p.id}><strong>{p.title}</strong><span>{label(p.status)}</span><small>{p.startDate}{p.endDate ? ` — ${p.endDate}` : ''}{p.specialistName ? ` · ${p.specialistName}` : ''}</small></div>)}</div> : <div className="empty-state">لا توجد خطط غذائية.</div>}
          <Link className="text-link" to="/admin/nutrition">إدارة التغذية</Link>
        </article>
        <article className="module-card"><span className="module-code">FITNESS</span><h3>خطط اللياقة</h3>
          {fitness.length ? <div className="portal-data-list">{fitness.slice(0, 5).map(p => <div className="portal-data-row" key={p.id}><strong>{p.title}</strong><span>{label(p.status)}</span><small>{p.startDate}{p.endDate ? ` — ${p.endDate}` : ''}{p.specialistName ? ` · ${p.specialistName}` : ''}</small></div>)}</div> : <div className="empty-state">لا توجد خطط لياقة.</div>}
          <Link className="text-link" to="/admin/fitness">إدارة اللياقة</Link>
        </article>
        <article className="module-card"><span className="module-code">APPOINTMENTS</span><h3>المواعيد القادمة</h3>
          {upcoming.length ? <div className="portal-data-list">{upcoming.map(a => <div className="portal-data-row" key={a.id}><strong>{a.appointmentType}</strong><span>{label(a.status)}</span><small>{new Date(a.startsAt).toLocaleString('ar-SA')}{a.staffName ? ` · ${a.staffName}` : ''}</small></div>)}</div> : <div className="empty-state">لا توجد مواعيد قادمة.</div>}
          <Link className="text-link" to="/admin/appointments">إدارة المواعيد</Link>
        </article>
        <article className="module-card"><span className="module-code">SALES</span><h3>مشتريات العميل</h3>
          {sales.length ? <div className="portal-data-list">{sales.slice(0, 8).map(s => <div className="portal-data-row" key={s.id}><strong>{s.saleNumber}</strong><span>{s.total} ر.س</span><small>{label(s.status)} · {new Date(s.createdAt).toLocaleDateString('ar-SA')} · {label(s.paymentStatus)}</small></div>)}</div> : <div className="empty-state">لا توجد مشتريات مرتبطة بالعميل.</div>}
        </article>
        <article className="module-card"><span className="module-code">ACTIVITY</span><h3>ملخص العميل</h3>
          <div className="portal-data-list">
            <div className="portal-data-row"><strong>القياسات</strong><span>{measurements.length}</span></div>
            <div className="portal-data-row"><strong>الخطط الغذائية</strong><span>{nutrition.length}</span></div>
            <div className="portal-data-row"><strong>خطط اللياقة</strong><span>{fitness.length}</span></div>
            <div className="portal-data-row"><strong>المواعيد</strong><span>{appointments.length}</span></div>
            <div className="portal-data-row"><strong>المتابعات</strong><span>{followUps.length}</span></div>
            <div className="portal-data-row"><strong>المبيعات</strong><span>{sales.length}</span></div>
          </div>
        </article>
      </section>
    </main>
  );
}
