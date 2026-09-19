import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from './lib/api';
import { OdooChatter, OdooSmartButtons, OdooStatusbar, OdooWizard } from './components/OdooERP';

type Customer = { id: string; customerNumber: string; firstName: string; lastName: string; phone?: string | null; email?: string | null; dateOfBirth?: string | null; gender?: string | null; status: string; source?: string | null; notes?: string | null };
type Measurement = { id: string; value: string; measuredAt: string; notes?: string | null; typeName: string; unit?: string | null };
type Plan = { id: string; title: string; goals?: string | null; startDate: string; endDate?: string | null; status: string; version: number; specialistName?: string | null };
type FollowUp = { id: string; followUpAt: string; nextFollowUpAt?: string | null; weight?: string | null; height?: string | null; adherenceScore?: number | null; nutritionAdherenceScore?: number | null; fitnessAdherenceScore?: number | null; notes?: string | null; recommendations?: string | null; staffName?: string | null };
type Appointment = { id: string; startsAt: string; endsAt: string; appointmentType: string; status: string; notes?: string | null; staffName?: string | null };
type Sale = { id: string; saleNumber: string; status: string; subtotal: string; discount: string; tax: string; total: string; paymentStatus: string; createdAt: string };
type ReturnLine = { id: string; productId: string; productName: string; sku: string; quantity: string; unitPrice: string; tax: string; lineTotal: string; returnedQuantity: number; returnableQuantity: number };
type ReturnSaleData = { sale: Sale & { paymentMethod?: string | null }; items: ReturnLine[] };
type Subscription = { id:string; productId:string; productName:string; sku:string; startDate:string; endDate:string; status:string; unitPrice:string; notes?:string|null };
type SubscriptionProduct = { id:string; sku:string; name:string; sellingPrice:string };
type Data = { customer: Customer; measurements: Measurement[]; nutrition: Plan[]; fitness: Plan[]; appointments: Appointment[]; sales: Sale[]; followUps: FollowUp[]; subscriptions: Subscription[] };
type Staff = { id: string; name: string; staffType: string };
type MeasurementType = { id: string; code: string; name: string; unit?: string | null };
type AuthMe = { user: { id: string } };
type StoreProduct = { id: string; sku: string; name: string; sellingPrice: string; purchaseCost: string; taxCode?: string | null; stock: number; productType?: string; active: boolean };
type SaleCartItem = StoreProduct & { quantity: number };

const statusLabel: Record<string, string> = { active: 'نشطة', draft: 'مسودة', completed: 'مكتملة', cancelled: 'ملغاة', scheduled: 'مجدول', confirmed: 'مؤكد', no_show: 'لم يحضر', pending: 'قيد المعالجة', completed_sale: 'مكتمل', partially_returned: 'مرتجع جزئي', returned: 'مرتجع', refunded: 'مسترد' };
function label(value: string) { return statusLabel[value] ?? value; }

export default function Customer360() {
  const { id } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'measurement' | 'followUp' | 'appointment' | 'nutrition' | 'fitness' | 'nutritionItems' | 'fitnessExercises' | 'sale' | 'subscription' | 'returnSale' | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<MeasurementType[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [measurement, setMeasurement] = useState({ typeId: '', value: '', measuredAt: '', notes: '' });
  const [followUp, setFollowUp] = useState({ staffId: '', followUpAt: '', nextFollowUpAt: '', weight: '', height: '', adherenceScore: '', nutritionScore: '', fitnessScore: '', notes: '', recommendations: '' });
  const [appointment, setAppointment] = useState({ staffId: '', startsAt: '', endsAt: '', appointmentType: 'استشارة', status: 'scheduled', notes: '' });
  const [planOptions, setPlanOptions] = useState<Staff[]>([]);
  const [nutritionPlan, setNutritionPlan] = useState({ specialistId: '', title: '', goals: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', status: 'draft' });
  const [fitnessPlan, setFitnessPlan] = useState({ specialistId: '', title: '', goals: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', status: 'draft' });
  const [detailPlan, setDetailPlan] = useState<{ kind: 'nutrition' | 'fitness'; id: string; title: string; items: any[] } | null>(null);
  const [itemForm, setItemForm] = useState({ mealType: 'وجبة رئيسية', itemName: '', quantity: '', unit: '', calories: '', notes: '' });
  const [exerciseForm, setExerciseForm] = useState({ exerciseName: '', sets: '', repetitions: '', durationSeconds: '', restSeconds: '', targetNotes: '' });
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [saleCart, setSaleCart] = useState<SaleCartItem[]>([]);
  const [salePaymentMethod, setSalePaymentMethod] = useState('cash');
  const [salePaymentStatus, setSalePaymentStatus] = useState('paid');
  const [returnSaleData, setReturnSaleData] = useState<ReturnSaleData | null>(null);
  const [subscriptionProducts, setSubscriptionProducts] = useState<SubscriptionProduct[]>([]);
  const [subscriptionForm, setSubscriptionForm] = useState({ productId:'', startDate:new Date().toISOString().slice(0,10), endDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10), notes:'' });
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const result = await apiFetch<Data>(`/customers/${id}/360`);
      setData(result); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل ملف العميل.'); }
    finally { if (silent) setRefreshing(false); else setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => { void load(true); }, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const openAction = async (next: 'measurement' | 'followUp' | 'appointment' | 'nutrition' | 'fitness' | 'sale' | 'subscription') => {
    setAction(next); setActionError(''); setActionMessage('');
    try {
      if (next === 'sale') {
        const result = await apiFetch<{ products: StoreProduct[] }>('/store/admin/products');
        setStoreProducts(result.products.filter(product => product.active && !['subscription','service'].includes(product.productType ?? 'product')));
        setSaleCart([]);
        return;
      }
      if (next === 'subscription') {
        const result = await apiFetch<{ products: SubscriptionProduct[] }>(`/customers/${id}/subscriptions/options`);
        setSubscriptionProducts(result.products);
        setSubscriptionForm(v => ({ ...v, productId: v.productId || result.products[0]?.id || '' }));
        return;
      }
      if (next === 'nutrition' || next === 'fitness') {
        const endpoint = next === 'nutrition' ? '/nutrition/options' : '/fitness/options';
        const options = await apiFetch<{ specialists: Staff[] }>(endpoint);
        setPlanOptions(options.specialists);
        const defaultStaff = options.specialists[0]?.id ?? '';
        if (next === 'nutrition') setNutritionPlan(v => ({ ...v, specialistId: v.specialistId || defaultStaff }));
        else setFitnessPlan(v => ({ ...v, specialistId: v.specialistId || defaultStaff }));
        return;
      }
      const [me, options] = await Promise.all([
        apiFetch<AuthMe>('/auth/me'),
        apiFetch<{ staff: Staff[]; customers?: unknown[] }>(next === 'appointment' ? '/appointments/options' : '/follow-ups/options'),
      ]);
      setCurrentUserId(me.user.id);
      setStaff(options.staff);
      const defaultStaff = me.user.id && options.staff.some(s => s.id === me.user.id) ? me.user.id : options.staff[0]?.id ?? '';
      if (next === 'followUp') setFollowUp(v => ({ ...v, staffId: defaultStaff }));
      if (next === 'appointment') setAppointment(v => ({ ...v, staffId: defaultStaff }));
      if (next === 'measurement') {
        const types = await apiFetch<{ types: MeasurementType[] }>('/measurements/types');
        setMeasurementTypes(types.types);
        setMeasurement(v => ({ ...v, typeId: v.typeId || types.types[0]?.id || '' }));
      }
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر تحميل بيانات النموذج.'); }
  };

  function addSaleProduct(product: StoreProduct) {
    setSaleCart(current => {
      const existing = current.find(item => item.id === product.id);
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      if (nextQuantity > product.stock) return current;
      return existing ? current.map(item => item.id === product.id ? { ...item, quantity: nextQuantity } : item) : [...current, { ...product, quantity: 1 }];
    });
  }

  function changeSaleQuantity(productId: string, delta: number) {
    setSaleCart(current => current.flatMap(item => {
      if (item.id !== productId) return [item];
      const quantity = item.quantity + delta;
      if (quantity <= 0) return [];
      if (quantity > item.stock) return [item];
      return [{ ...item, quantity }];
    }));
  }

  async function saveSubscription(e: FormEvent) {
    e.preventDefault();
    if (!subscriptionForm.productId) { setActionError('اختر منتج الاشتراك.'); return; }
    if (subscriptionForm.endDate < subscriptionForm.startDate) { setActionError('تاريخ النهاية يجب أن يكون بعد أو مساويًا لتاريخ البداية.'); return; }
    setSaving(true); setActionError(''); setActionMessage('');
    try {
      await apiFetch(`/customers/${id}/subscriptions`, {
        method:'POST',
        body:JSON.stringify({
          productId: subscriptionForm.productId,
          startDate: subscriptionForm.startDate,
          endDate: subscriptionForm.endDate,
          notes: subscriptionForm.notes || null,
        }),
      });
      setActionMessage('تم تفعيل الاشتراك للعميل بالفترة المحددة.');
      await load(true);
      setSubscriptionForm(v => ({ ...v, productId: subscriptionProducts[0]?.id || '', notes:'' }));
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر إنشاء الاشتراك.'); }
    finally { setSaving(false); }
  }

  async function saveSale(e: FormEvent) {
    e.preventDefault();
    if (!saleCart.length) { setActionError('أضف منتجًا واحدًا على الأقل إلى البيع.'); return; }
    setSaving(true); setActionError(''); setActionMessage('');
    try {
      const result = await apiFetch<{ sale: { saleNumber: string; total: string } }>('/store/admin/sales', {
        method: 'POST',
        body: JSON.stringify({
          customerId: id,
          paymentMethod: salePaymentMethod,
          paymentStatus: salePaymentStatus,
          items: saleCart.map(item => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      setSaleCart([]);
      setActionMessage(`تم إنشاء البيع ${result.sale.saleNumber} بقيمة ${result.sale.total} ريال وتحديث مخزون المنتجات وملف العميل.`);
      await load(true);
      const refreshed = await apiFetch<{ products: StoreProduct[] }>('/store/admin/products');
      setStoreProducts(refreshed.products.filter(product => product.active && !['subscription','service'].includes(product.productType ?? 'product')));
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر إنشاء البيع.'); }
    finally { setSaving(false); }
  }

  async function openReturnSale(sale: Sale) {
    setAction('returnSale'); setActionError(''); setActionMessage(''); setSaving(true);
    try {
      const result = await apiFetch<ReturnSaleData>(`/store/admin/sales/${sale.id}`);
      setReturnSaleData(result);
      setReturnQuantities(Object.fromEntries(result.items.filter(item => item.returnableQuantity > 0).map(item => [item.productId, ''])));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل المرتجع.');
      setReturnSaleData(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnSaleData) return;
    const items = returnSaleData.items
      .map(item => ({ productId: item.productId, quantity: Number(returnQuantities[item.productId] || 0) }))
      .filter(item => item.quantity > 0);
    if (!items.length) { setActionError('حدد كمية مرتجعة واحدة على الأقل.'); return; }
    const confirmed = window.confirm('سيتم تسجيل المرتجع وإعادة الكميات المحددة فقط إلى المخزون. هل تريد المتابعة؟');
    if (!confirmed) return;
    setSaving(true); setActionError(''); setActionMessage('');
    try {
      const result = await apiFetch<{ ok: true; returnTotal: string; status: string }>(`/store/admin/sales/${returnSaleData.sale.id}/return`, { method: 'POST', body: JSON.stringify({ items }) });
      setActionMessage(`تم تسجيل المرتجع بقيمة ${result.returnTotal} ريال وتحديث المخزون. الحالة: ${result.status === 'returned' ? 'مرتجع بالكامل' : 'مرتجع جزئي'}.`);
      setReturnSaleData(null); setReturnQuantities({}); setAction(null);
      await load(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذر تنفيذ المرتجع.');
    } finally {
      setSaving(false);
    }
  }

  async function saveMeasurement(e: FormEvent) {
    e.preventDefault(); setSaving(true); setActionError(''); setActionMessage('');
    try {
      await apiFetch('/measurements', { method: 'POST', body: JSON.stringify({ customerId: id, measurementTypeId: measurement.typeId, value: measurement.value, measuredAt: measurement.measuredAt ? new Date(measurement.measuredAt).toISOString() : undefined, notes: measurement.notes || null }) });
      setMeasurement(v => ({ ...v, value: '', measuredAt: '', notes: '' })); setActionMessage('تم حفظ القياس وتحديث ملف العميل.');
      await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر حفظ القياس.'); }
    finally { setSaving(false); }
  }

  async function saveFollowUp(e: FormEvent) {
    e.preventDefault(); setSaving(true); setActionError(''); setActionMessage('');
    try {
      await apiFetch('/follow-ups', { method: 'POST', body: JSON.stringify({ customerId: id, staffId: followUp.staffId || currentUserId, followUpAt: followUp.followUpAt ? new Date(followUp.followUpAt).toISOString() : undefined, nextFollowUpAt: followUp.nextFollowUpAt ? new Date(followUp.nextFollowUpAt).toISOString() : null, weight: followUp.weight || null, height: followUp.height || null, adherenceScore: followUp.adherenceScore || null, nutritionAdherenceScore: followUp.nutritionScore || null, fitnessAdherenceScore: followUp.fitnessScore || null, notes: followUp.notes || null, recommendations: followUp.recommendations || null }) });
      setFollowUp(v => ({ ...v, followUpAt: '', nextFollowUpAt: '', weight: '', height: '', adherenceScore: '', nutritionScore: '', fitnessScore: '', notes: '', recommendations: '' })); setActionMessage('تم حفظ المتابعة وتحديث ملف العميل.');
      await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر حفظ المتابعة.'); }
    finally { setSaving(false); }
  }

  async function openPlanDetails(kind: 'nutrition' | 'fitness', planId: string) {
    setAction(kind === 'nutrition' ? 'nutritionItems' : 'fitnessExercises'); setActionError(''); setActionMessage('');
    try {
      const endpoint = kind === 'nutrition' ? '/nutrition' : '/fitness';
      const result = await apiFetch<{ plans: any[] }>(endpoint);
      const plan = result.plans.find(p => p.id === planId);
      if (!plan) throw new Error('الخطة غير موجودة.');
      setDetailPlan({ kind, id: plan.id, title: plan.title, items: kind === 'nutrition' ? (plan.items ?? []) : (plan.exercises ?? []) });
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر تحميل تفاصيل الخطة.'); }
  }

  async function savePlanItem(e: FormEvent) {
    e.preventDefault(); if (!detailPlan || detailPlan.kind !== 'nutrition') return;
    setSaving(true); setActionError(''); setActionMessage('');
    try {
      await apiFetch('/nutrition/' + detailPlan.id + '/items', { method: 'POST', body: JSON.stringify({ ...itemForm, quantity: itemForm.quantity || null, calories: itemForm.calories || null, sortOrder: detailPlan.items.length }) });
      const result = await apiFetch<{ plans: any[] }>('/nutrition');
      const plan = result.plans.find(p => p.id === detailPlan.id);
      setDetailPlan(v => v ? { ...v, items: plan?.items ?? [] } : v);
      setItemForm({ mealType: 'وجبة رئيسية', itemName: '', quantity: '', unit: '', calories: '', notes: '' });
      setActionMessage('تمت إضافة الوجبة للخطة الغذائية.'); await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر إضافة الوجبة.'); }
    finally { setSaving(false); }
  }

  async function saveExercise(e: FormEvent) {
    e.preventDefault(); if (!detailPlan || detailPlan.kind !== 'fitness') return;
    setSaving(true); setActionError(''); setActionMessage('');
    try {
      await apiFetch('/fitness/' + detailPlan.id + '/exercises', { method: 'POST', body: JSON.stringify({ ...exerciseForm, sets: exerciseForm.sets || null, repetitions: exerciseForm.repetitions || null, durationSeconds: exerciseForm.durationSeconds || null, restSeconds: exerciseForm.restSeconds || null, sortOrder: detailPlan.items.length }) });
      const result = await apiFetch<{ plans: any[] }>('/fitness');
      const plan = result.plans.find(p => p.id === detailPlan.id);
      setDetailPlan(v => v ? { ...v, items: plan?.exercises ?? [] } : v);
      setExerciseForm({ exerciseName: '', sets: '', repetitions: '', durationSeconds: '', restSeconds: '', targetNotes: '' });
      setActionMessage('تمت إضافة التمرين لخطة اللياقة.'); await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر إضافة التمرين.'); }
    finally { setSaving(false); }
  }

  async function deletePlanItem(itemId: string) {
    if (!detailPlan || detailPlan.kind !== 'nutrition') return;
    try { await apiFetch('/nutrition/' + detailPlan.id + '/items/' + itemId, { method: 'DELETE' }); setDetailPlan(v => v ? { ...v, items: v.items.filter(x => x.id !== itemId) } : v); setActionMessage('تم حذف الوجبة.'); await load(true); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر حذف الوجبة.'); }
  }

  async function deleteExercise(itemId: string) {
    if (!detailPlan || detailPlan.kind !== 'fitness') return;
    try { await apiFetch('/fitness/' + detailPlan.id + '/exercises/' + itemId, { method: 'DELETE' }); setDetailPlan(v => v ? { ...v, items: v.items.filter(x => x.id !== itemId) } : v); setActionMessage('تم حذف التمرين.'); await load(true); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر حذف التمرين.'); }
  }

  async function savePlan(kind: 'nutrition' | 'fitness', e: FormEvent) {
    e.preventDefault(); setSaving(true); setActionError(''); setActionMessage('');
    try {
      const plan = kind === 'nutrition' ? nutritionPlan : fitnessPlan;
      const endpoint = kind === 'nutrition' ? '/nutrition' : '/fitness';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          customerId: id,
          specialistId: plan.specialistId,
          title: plan.title,
          goals: plan.goals || null,
          startDate: plan.startDate,
          endDate: plan.endDate || null,
          status: plan.status,
        }),
      });
      if (kind === 'nutrition') setNutritionPlan(v => ({ ...v, title: '', goals: '', endDate: '', status: 'draft' }));
      else setFitnessPlan(v => ({ ...v, title: '', goals: '', endDate: '', status: 'draft' }));
      setActionMessage(kind === 'nutrition' ? 'تم إنشاء الخطة الغذائية وتحديث ملف العميل.' : 'تم إنشاء خطة اللياقة وتحديث ملف العميل.');
      await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر حفظ الخطة.'); }
    finally { setSaving(false); }
  }

  async function saveAppointment(e: FormEvent) {
    e.preventDefault(); setSaving(true); setActionError(''); setActionMessage('');
    try {
      if (!appointment.startsAt || !appointment.endsAt) throw new Error('حدد وقت بداية ونهاية الموعد.');
      await apiFetch('/appointments', { method: 'POST', body: JSON.stringify({ customerId: id, staffId: appointment.staffId || currentUserId, startsAt: new Date(appointment.startsAt).toISOString(), endsAt: new Date(appointment.endsAt).toISOString(), appointmentType: appointment.appointmentType, status: appointment.status, notes: appointment.notes || null }) });
      setAppointment(v => ({ ...v, startsAt: '', endsAt: '', notes: '' })); setActionMessage('تم إنشاء الموعد وتحديث ملف العميل.');
      await load(true);
    } catch (err) { setActionError(err instanceof Error ? err.message : 'تعذر إنشاء الموعد.'); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="app-shell"><div className="info-strip">جارٍ تحميل ملف العميل...</div></main>;
  if (error || !data) return <main className="app-shell"><div className="info-strip warning">{error || 'العميل غير موجود.'}</div><Link className="secondary-button" to="/admin/customers">العودة إلى العملاء</Link></main>;

  const { customer, measurements, nutrition, fitness, appointments, sales, followUps } = data;
  const upcoming = appointments.filter(a => new Date(a.startsAt).getTime() >= Date.now()).slice(0, 5);
  const nextAppointment = upcoming[0];
  const latestWeight = followUps[0]?.weight ?? null;
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><p className="eyebrow">ملف العميل الشامل</p><h1>{customer.firstName} {customer.lastName}</h1><p>{customer.customerNumber} · {customer.status === 'active' ? 'عميل نشط' : label(customer.status)}</p></div>
        <div className="header-actions"><span className="live-search-status">{refreshing ? 'جاري التحديث...' : 'تحديث تلقائي'}</span><button className="secondary-button" type="button" onClick={() => void load(true)}>تحديث الآن</button><Link className="secondary-button" to="/admin/customers">العملاء</Link><Link className="secondary-button" to="/admin/dashboard">لوحة التحكم</Link></div>
      </header>

      <OdooStatusbar current={customer.status === 'active' ? 'active' : 'inactive'} steps={[{ key: 'active', label: 'نشط' }, { key: 'inactive', label: 'غير نشط' }]} />

      <OdooSmartButtons buttons={[
        { label: 'المواعيد', value: appointments.length, onClick: () => void openAction('appointment') },
        { label: 'القياسات', value: measurements.length, onClick: () => void openAction('measurement') },
        { label: 'المتابعات', value: followUps.length, onClick: () => void openAction('followUp') },
        { label: 'الخطط الغذائية', value: nutrition.length, onClick: () => void openAction('nutrition') },
        { label: 'خطط اللياقة', value: fitness.length, onClick: () => void openAction('fitness') },
        { label: 'المبيعات', value: sales.length, onClick: () => void openAction('sale') },
        { label: 'الاشتراكات', value: data.subscriptions.length, onClick: () => void openAction('subscription') },
      ]} />

      <section className="customer-action-bar">
        <div className="customer-action-title"><span className="eyebrow">إجراءات سريعة</span><strong>العمل على العميل مباشرة</strong></div>
        <div className="customer-action-links">
          {customer.phone && <a className="primary-action" href={`tel:${customer.phone}`}>اتصال</a>}
          {customer.phone && <a className="secondary-button" href={`https://wa.me/${customer.phone.replace(/\\D/g, '')}`} target="_blank" rel="noreferrer">واتساب</a>}
          <button className="secondary-button" type="button" onClick={() => void openAction('followUp')}>متابعة جديدة</button>
          <button className="secondary-button" type="button" onClick={() => void openAction('measurement')}>إضافة قياس</button>
          <button className="secondary-button" type="button" onClick={() => void openAction('nutrition')}>خطة غذائية</button>
          <button className="secondary-button" type="button" onClick={() => void openAction('fitness')}>خطة لياقة</button>
          <button className="secondary-button" type="button" onClick={() => void openAction('appointment')}>موعد</button><button className="secondary-button" type="button" onClick={() => void openAction('subscription')}>اشتراك</button><button className="primary-action" type="button" onClick={() => void openAction('sale')}>بيع للعميل</button>
        </div>
      </section>

      {action && (
        <OdooWizard
          open={true}
          onClose={() => setAction(null)}
          title={action === 'measurement' ? 'إضافة قياس للعميل' : action === 'followUp' ? 'تسجيل متابعة للعميل' : action === 'appointment' ? 'حجز موعد للعميل' : action === 'nutrition' ? 'إنشاء خطة غذائية للعميل' : action === 'fitness' ? 'إنشاء خطة لياقة للعميل' : action === 'subscription' ? 'تفعيل اشتراك للعميل' : action === 'sale' ? 'إنشاء بيع للعميل' : action === 'returnSale' ? 'مرتجع جزئي من عملية بيع' : detailPlan ? (detailPlan.kind === 'nutrition' ? 'تفاصيل الخطة الغذائية' : 'تفاصيل خطة اللياقة') : ''}
          footer={<button className="secondary-button" type="button" onClick={() => setAction(null)}>إغلاق</button>}
        >
          {actionError && <div className="info-strip warning">{actionError}</div>}
          {actionMessage && <div className="info-strip">{actionMessage}</div>}

          {action === 'returnSale' && returnSaleData && <form className="form-stack" onSubmit={saveReturn}>
            <div className="panel-description">البيع: <strong>{returnSaleData.sale.saleNumber}</strong>. أدخل الكمية المراد إرجاعها لكل صنف. لا يمكن تجاوز الكمية المتبقية القابلة للإرجاع.</div>
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المنتج</th><th>المباع</th><th>تم إرجاعه</th><th>المتبقي</th><th>كمية المرتجع</th></tr></thead><tbody>
              {returnSaleData.items.map(item => <tr key={item.id}><td>{item.productName}<small>{item.sku}</small></td><td>{Number(item.quantity).toFixed(3)}</td><td>{item.returnedQuantity.toFixed(3)}</td><td>{item.returnableQuantity.toFixed(3)}</td><td><input type="number" min="0" max={item.returnableQuantity} step="0.001" disabled={item.returnableQuantity <= 0} value={returnQuantities[item.productId] ?? ''} onChange={e => setReturnQuantities(v => ({ ...v, [item.productId]: e.target.value }))} /></td></tr>)}
            </tbody></table></div>
            <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'تسجيل المرتجع'}</button>
          </form>}
          {action === 'subscription' && <form className="form-stack" onSubmit={saveSubscription}>
            <div className="panel-description">حدد منتج الاشتراك وفترة الاستحقاق للعميل. الاشتراك خدمة غير مخزنية ولا يُخصم من رصيد المخزون.</div>
            <div className="form-row">
              <label>منتج الاشتراك<select required value={subscriptionForm.productId} onChange={e => setSubscriptionForm(v => ({ ...v, productId:e.target.value }))}>
                <option value="">اختر الاشتراك</option>
                {subscriptionProducts.map(product => <option key={product.id} value={product.id}>{product.name} — {product.sku} · {Number(product.sellingPrice).toFixed(2)} ر.س</option>)}
              </select></label>
              <label>من<input required type="date" value={subscriptionForm.startDate} onChange={e => setSubscriptionForm(v => ({ ...v, startDate:e.target.value }))} /></label>
              <label>إلى<input required type="date" min={subscriptionForm.startDate} value={subscriptionForm.endDate} onChange={e => setSubscriptionForm(v => ({ ...v, endDate:e.target.value }))} /></label>
            </div>
            <label>ملاحظات<textarea value={subscriptionForm.notes} onChange={e => setSubscriptionForm(v => ({ ...v, notes:e.target.value }))} maxLength={2000} /></label>
            {!subscriptionProducts.length && <div className="empty-state">لا توجد منتجات اشتراك نشطة. أنشئ منتجًا بنوع «اشتراك» من المنتجات أولًا.</div>}
            <button className="primary-action button" disabled={saving || !subscriptionProducts.length}>{saving ? 'جارٍ الحفظ...' : 'تفعيل الاشتراك'}</button>
          </form>}
          {action === 'sale' && <form className="form-stack" onSubmit={saveSale}>
            <div className="store-product-grid">
              {storeProducts.map(product => <article className="store-product-card" key={product.id}>
                <span className="module-code">{product.sku}</span><h3>{product.name}</h3>
                <strong>{Number(product.sellingPrice).toFixed(2)} ريال</strong>
                <span className="module-status">المخزون: {product.stock}</span>
                {product.taxCode && <small>الضريبة: {product.taxCode}</small>}
                <button className="secondary-button" type="button" disabled={product.stock <= 0} onClick={() => addSaleProduct(product)}>إضافة للبيع</button>
              </article>)}
            </div>
            <div className="store-cart">
              <div className="panel-heading-row"><div><h3>سلة البيع</h3><p className="panel-description">البيع مرتبط مباشرة بهذا العميل. لا يتم تجاوز المخزون المتاح.</p></div></div>
              {saleCart.length ? <div className="cart-list">{saleCart.map(item => <div className="cart-row" key={item.id}><div><strong>{item.name}</strong><small>{item.quantity} × {Number(item.sellingPrice).toFixed(2)} ريال</small></div><div className="cart-controls"><button type="button" onClick={() => changeSaleQuantity(item.id,-1)}>−</button><span>{item.quantity}</span><button type="button" onClick={() => changeSaleQuantity(item.id,1)}>+</button><button className="cart-remove" type="button" onClick={() => changeSaleQuantity(item.id,-item.quantity)}>حذف</button></div></div>)}</div> : <div className="empty-state">لم تتم إضافة منتجات للبيع.</div>}
              <div className="form-row">
                <label>طريقة الدفع<select value={salePaymentMethod} onChange={e => setSalePaymentMethod(e.target.value)}><option value="cash">نقدي</option><option value="mada">مدى</option><option value="card">بطاقة</option><option value="bank_transfer">تحويل بنكي</option><option value="apple_pay">Apple Pay</option></select></label>
                <label>حالة الدفع<select value={salePaymentStatus} onChange={e => setSalePaymentStatus(e.target.value)}><option value="paid">مدفوع</option><option value="unpaid">غير مدفوع</option><option value="partial">جزئي</option></select></label>
              </div>
              <button className="primary-action" type="submit" disabled={saving || !saleCart.length}>{saving ? 'جارٍ الحفظ...' : 'حفظ البيع وصرف المخزون'}</button>
            </div>
          </form>}
          {action === 'measurement' && <form className="form-stack" onSubmit={saveMeasurement}>
            <div className="form-row">
              <label>نوع القياس<select required value={measurement.typeId} onChange={e => setMeasurement(v => ({ ...v, typeId: e.target.value }))}>{measurementTypes.map(t => <option key={t.id} value={t.id}>{t.name}{t.unit ? ` (${t.unit})` : ''}</option>)}</select></label>
              <label>القيمة<input type="number" step="0.01" required value={measurement.value} onChange={e => setMeasurement(v => ({ ...v, value: e.target.value }))} /></label>
              <label>وقت القياس<input type="datetime-local" value={measurement.measuredAt} onChange={e => setMeasurement(v => ({ ...v, measuredAt: e.target.value }))} /></label>
            </div>
            <label>ملاحظات<textarea value={measurement.notes} onChange={e => setMeasurement(v => ({ ...v, notes: e.target.value }))} /></label>
            <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ القياس'}</button>
          </form>}

          {action === 'followUp' && <form className="form-stack" onSubmit={saveFollowUp}>
            <div className="form-row">
              <label>المختص / الموظف<select required value={followUp.staffId} onChange={e => setFollowUp(v => ({ ...v, staffId: e.target.value }))}>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>تاريخ المتابعة<input type="datetime-local" value={followUp.followUpAt} onChange={e => setFollowUp(v => ({ ...v, followUpAt: e.target.value }))} /></label>
              <label>المتابعة القادمة<input type="datetime-local" value={followUp.nextFollowUpAt} onChange={e => setFollowUp(v => ({ ...v, nextFollowUpAt: e.target.value }))} /></label>
              <label>الوزن (كجم)<input type="number" min="0" step="0.01" value={followUp.weight} onChange={e => setFollowUp(v => ({ ...v, weight: e.target.value }))} /></label>
              <label>الطول (سم)<input type="number" min="0" step="0.1" value={followUp.height} onChange={e => setFollowUp(v => ({ ...v, height: e.target.value }))} /></label>
            </div>
            <div className="form-row">
              <label>الالتزام العام (%)<input type="number" min="0" max="100" value={followUp.adherenceScore} onChange={e => setFollowUp(v => ({ ...v, adherenceScore: e.target.value }))} /></label>
              <label>الالتزام الغذائي (%)<input type="number" min="0" max="100" value={followUp.nutritionScore} onChange={e => setFollowUp(v => ({ ...v, nutritionScore: e.target.value }))} /></label>
              <label>الالتزام الرياضي (%)<input type="number" min="0" max="100" value={followUp.fitnessScore} onChange={e => setFollowUp(v => ({ ...v, fitnessScore: e.target.value }))} /></label>
            </div>
            <label>ملاحظات المتابعة<textarea value={followUp.notes} onChange={e => setFollowUp(v => ({ ...v, notes: e.target.value }))} /></label>
            <label>التوصيات للعميل<textarea value={followUp.recommendations} onChange={e => setFollowUp(v => ({ ...v, recommendations: e.target.value }))} /></label>
            <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ المتابعة'}</button>
          </form>}

          {(action === 'nutrition' || action === 'fitness') && <form className="form-stack" onSubmit={e => void savePlan(action, e)}>
            <div className="form-row">
              <label>الأخصائي / المدرب<select required value={action === 'nutrition' ? nutritionPlan.specialistId : fitnessPlan.specialistId} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, specialistId: e.target.value })) : setFitnessPlan(v => ({ ...v, specialistId: e.target.value }))}>{planOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>اسم الخطة<input required minLength={2} value={action === 'nutrition' ? nutritionPlan.title : fitnessPlan.title} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, title: e.target.value })) : setFitnessPlan(v => ({ ...v, title: e.target.value }))} placeholder={action === 'nutrition' ? 'خطة خفض الوزن — المرحلة الأولى' : 'خطة لياقة — المرحلة الأولى'} /></label>
              <label>الحالة<select value={action === 'nutrition' ? nutritionPlan.status : fitnessPlan.status} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, status: e.target.value })) : setFitnessPlan(v => ({ ...v, status: e.target.value }))}><option value="draft">مسودة</option><option value="active">نشطة</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option></select></label>
            </div>
            <label>الأهداف<textarea value={action === 'nutrition' ? nutritionPlan.goals : fitnessPlan.goals} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, goals: e.target.value })) : setFitnessPlan(v => ({ ...v, goals: e.target.value }))} /></label>
            <div className="form-row">
              <label>تاريخ البداية<input type="date" required value={action === 'nutrition' ? nutritionPlan.startDate : fitnessPlan.startDate} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, startDate: e.target.value })) : setFitnessPlan(v => ({ ...v, startDate: e.target.value }))} /></label>
              <label>تاريخ النهاية<input type="date" value={action === 'nutrition' ? nutritionPlan.endDate : fitnessPlan.endDate} onChange={e => action === 'nutrition' ? setNutritionPlan(v => ({ ...v, endDate: e.target.value })) : setFitnessPlan(v => ({ ...v, endDate: e.target.value }))} /></label>
            </div>
            <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : action === 'nutrition' ? 'إنشاء الخطة الغذائية' : 'إنشاء خطة اللياقة'}</button>
          </form>}

          {action === 'nutritionItems' && detailPlan?.kind === 'nutrition' && <>
            <div className="portal-data-list">{detailPlan.items.length ? detailPlan.items.map(item => <div className="portal-data-row" key={item.id}><strong>{item.mealType} — {item.itemName}</strong><span>{item.quantity ?? '—'} {item.unit ?? ''}{item.calories != null ? ' · ' + item.calories + ' سعرة' : ''}</span><button className="text-link button-link" type="button" onClick={() => void deletePlanItem(item.id)}>حذف</button></div>) : <div className="empty-state">لا توجد وجبات مضافة للخطة.</div>}</div>
            <form className="form-stack" onSubmit={savePlanItem}>
              <div className="form-row"><label>نوع الوجبة<input required value={itemForm.mealType} onChange={e => setItemForm(v => ({ ...v, mealType: e.target.value }))} /></label><label>اسم الطعام / العنصر<input required value={itemForm.itemName} onChange={e => setItemForm(v => ({ ...v, itemName: e.target.value }))} /></label><label>الكمية<input type="number" min="0" step="0.01" value={itemForm.quantity} onChange={e => setItemForm(v => ({ ...v, quantity: e.target.value }))} /></label><label>الوحدة<input value={itemForm.unit} onChange={e => setItemForm(v => ({ ...v, unit: e.target.value }))} placeholder="جرام / حبة" /></label><label>السعرات<input type="number" min="0" step="0.01" value={itemForm.calories} onChange={e => setItemForm(v => ({ ...v, calories: e.target.value }))} /></label></div>
              <label>ملاحظات<textarea value={itemForm.notes} onChange={e => setItemForm(v => ({ ...v, notes: e.target.value }))} /></label><button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة الوجبة'}</button>
            </form>
          </>}

          {action === 'fitnessExercises' && detailPlan?.kind === 'fitness' && <>
            <div className="portal-data-list">{detailPlan.items.length ? detailPlan.items.map(item => <div className="portal-data-row" key={item.id}><strong>{item.exerciseName}</strong><span>{item.sets ?? '—'} مجموعات · {item.repetitions ?? '—'} تكرارات{item.durationSeconds != null ? ' · ' + item.durationSeconds + ' ثانية' : ''}</span><button className="text-link button-link" type="button" onClick={() => void deleteExercise(item.id)}>حذف</button></div>) : <div className="empty-state">لا توجد تمارين مضافة للخطة.</div>}</div>
            <form className="form-stack" onSubmit={saveExercise}>
              <div className="form-row"><label>اسم التمرين<input required value={exerciseForm.exerciseName} onChange={e => setExerciseForm(v => ({ ...v, exerciseName: e.target.value }))} /></label><label>المجموعات<input type="number" min="0" value={exerciseForm.sets} onChange={e => setExerciseForm(v => ({ ...v, sets: e.target.value }))} /></label><label>التكرارات<input type="number" min="0" value={exerciseForm.repetitions} onChange={e => setExerciseForm(v => ({ ...v, repetitions: e.target.value }))} /></label><label>المدة (ثانية)<input type="number" min="0" value={exerciseForm.durationSeconds} onChange={e => setExerciseForm(v => ({ ...v, durationSeconds: e.target.value }))} /></label><label>الراحة (ثانية)<input type="number" min="0" value={exerciseForm.restSeconds} onChange={e => setExerciseForm(v => ({ ...v, restSeconds: e.target.value }))} /></label></div>
              <label>ملاحظات التمرين<textarea value={exerciseForm.targetNotes} onChange={e => setExerciseForm(v => ({ ...v, targetNotes: e.target.value }))} /></label><button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة التمرين'}</button>
            </form>
          </>}
          
          {action === 'appointment' && <form className="form-stack" onSubmit={saveAppointment}>
            <div className="form-row">
              <label>المختص / الموظف<select required value={appointment.staffId} onChange={e => setAppointment(v => ({ ...v, staffId: e.target.value }))}>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label>نوع الموعد<input required minLength={2} value={appointment.appointmentType} onChange={e => setAppointment(v => ({ ...v, appointmentType: e.target.value }))} /></label>
              <label>البداية<input required type="datetime-local" value={appointment.startsAt} onChange={e => setAppointment(v => ({ ...v, startsAt: e.target.value }))} /></label>
              <label>النهاية<input required type="datetime-local" value={appointment.endsAt} onChange={e => setAppointment(v => ({ ...v, endsAt: e.target.value }))} /></label>
              <label>الحالة<select value={appointment.status} onChange={e => setAppointment(v => ({ ...v, status: e.target.value }))}><option value="scheduled">مجدول</option><option value="confirmed">مؤكد</option></select></label>
            </div>
            <label>ملاحظات الموعد<textarea value={appointment.notes} onChange={e => setAppointment(v => ({ ...v, notes: e.target.value }))} /></label>
            <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الموعد'}</button>
          </form>}

        </OdooWizard>
      )}

      <section className="customer-kpi-grid">
        <div className="customer-kpi"><span>آخر وزن مسجل</span><strong>{latestWeight ? `${latestWeight} كجم` : '—'}</strong></div>
        <div className="customer-kpi"><span>المتابعات</span><strong>{followUps.length}</strong></div>
        <div className="customer-kpi"><span>المواعيد القادمة</span><strong>{upcoming.length}</strong></div>
        <div className="customer-kpi"><span>إجمالي المشتريات</span><strong>{totalSales.toFixed(2)} ر.س</strong></div>
      </section>

      <section className="customer-next-appointment"><div><span className="eyebrow">الموعد القادم</span><strong>{nextAppointment ? nextAppointment.appointmentType : 'لا يوجد موعد قادم'}</strong></div><span>{nextAppointment ? new Date(nextAppointment.startsAt).toLocaleString('ar-SA') : 'يمكن إنشاء موعد من الإجراءات السريعة'}</span></section>

      <section className="customer-summary">
        <div><span className="eyebrow">رقم العميل</span><strong>{customer.customerNumber}</strong></div><div><span className="eyebrow">الجوال</span><span dir="ltr">{customer.phone || '—'}</span></div><div><span className="eyebrow">البريد الإلكتروني</span><span dir="ltr">{customer.email || '—'}</span></div><div><span className="eyebrow">تاريخ الميلاد</span><span>{customer.dateOfBirth || '—'}</span></div><div><span className="eyebrow">الجنس</span><span>{customer.gender === 'male' ? 'ذكر' : customer.gender === 'female' ? 'أنثى' : '—'}</span></div><div><span className="eyebrow">مصدر العميل</span><span>{customer.source || '—'}</span></div>
      </section>

      {customer.notes && <section className="panel"><div className="section-heading left"><span className="eyebrow">ملاحظات</span><h2>ملاحظات العميل</h2></div><p>{customer.notes}</p></section>}

      <OdooChatter
        notes={customer.notes ? [customer.notes] : []}
        activities={[
          { title: 'آخر متابعة', date: followUps[0] ? new Date(followUps[0].followUpAt).toLocaleString('ar-SA') : undefined, detail: followUps[0]?.recommendations || followUps[0]?.notes || undefined },
          { title: 'آخر موعد', date: appointments[0] ? new Date(appointments[0].startsAt).toLocaleString('ar-SA') : undefined, detail: appointments[0]?.appointmentType },
          { title: 'آخر عملية بيع', date: sales[0] ? new Date(sales[0].createdAt).toLocaleString('ar-SA') : undefined, detail: sales[0] ? `${sales[0].saleNumber} · ${sales[0].total} ر.س` : undefined },
        ].filter(activity => activity.date || activity.detail)}
      />

      <section className="module-grid customer-live-grid">
        <article className="module-card"><span className="module-code">FOLLOW-UP</span><h3>المتابعات الدورية</h3>{followUps.length ? <div className="portal-data-list">{followUps.slice(0, 5).map(f => <div className="portal-data-row" key={f.id}><strong>{new Date(f.followUpAt).toLocaleDateString('ar-SA')}</strong><span>{f.weight ? f.weight + ' كجم' : '—'}{f.adherenceScore == null ? '' : ' · ' + f.adherenceScore + '%'}</span><small>{f.staffName || '—'}{f.nextFollowUpAt ? ' · التالية ' + new Date(f.nextFollowUpAt).toLocaleDateString('ar-SA') : ''}</small></div>)}</div> : <div className="empty-state">لا توجد متابعات.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('followUp')}>إضافة متابعة</button></article>
        <article className="module-card"><span className="module-code">MEASUREMENTS</span><h3>آخر القياسات</h3>{measurements.length ? <div className="portal-data-list">{measurements.slice(0, 8).map(m => <div className="portal-data-row" key={m.id}><strong>{m.typeName}</strong><span>{m.value} {m.unit || ''}</span><small>{new Date(m.measuredAt).toLocaleString('ar-SA')}</small></div>)}</div> : <div className="empty-state">لا توجد قياسات.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('measurement')}>إضافة قياس</button></article>
        <article className="module-card"><span className="module-code">NUTRITION</span><h3>الخطط الغذائية</h3>{nutrition.length ? <div className="portal-data-list">{nutrition.slice(0, 5).map(p => <div className="portal-data-row" key={p.id}><strong>{p.title}</strong><span>{label(p.status)}</span><small>{p.startDate}{p.endDate ? ` — ${p.endDate}` : ''}{p.specialistName ? ` · ${p.specialistName}` : ''}</small><button className="text-link button-link" type="button" onClick={() => void openPlanDetails('nutrition', p.id)}>تفاصيل / الوجبات</button></div>)}</div> : <div className="empty-state">لا توجد خطط غذائية.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('nutrition')}>إنشاء خطة غذائية</button></article>
        <article className="module-card"><span className="module-code">FITNESS</span><h3>خطط اللياقة</h3>{fitness.length ? <div className="portal-data-list">{fitness.slice(0, 5).map(p => <div className="portal-data-row" key={p.id}><strong>{p.title}</strong><span>{label(p.status)}</span><small>{p.startDate}{p.endDate ? ` — ${p.endDate}` : ''}{p.specialistName ? ` · ${p.specialistName}` : ''}</small><button className="text-link button-link" type="button" onClick={() => void openPlanDetails('fitness', p.id)}>تفاصيل / التمارين</button></div>)}</div> : <div className="empty-state">لا توجد خطط لياقة.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('fitness')}>إنشاء خطة لياقة</button></article>
        <article className="module-card"><span className="module-code">APPOINTMENTS</span><h3>المواعيد القادمة</h3>{upcoming.length ? <div className="portal-data-list">{upcoming.map(a => <div className="portal-data-row" key={a.id}><strong>{a.appointmentType}</strong><span>{label(a.status)}</span><small>{new Date(a.startsAt).toLocaleString('ar-SA')}{a.staffName ? ` · ${a.staffName}` : ''}</small></div>)}</div> : <div className="empty-state">لا توجد مواعيد قادمة.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('appointment')}>حجز موعد</button></article>
        <article className="module-card"><span className="module-code">SUBSCRIPTIONS</span><h3>اشتراكات العميل</h3>{data.subscriptions.length ? <div className="portal-data-list">{data.subscriptions.slice(0, 6).map(s => <div className="portal-data-row" key={s.id}><strong>{s.productName}</strong><span>{s.startDate} — {s.endDate}</span><small>{Number(s.unitPrice).toFixed(2)} ر.س · {s.status === 'active' ? 'نشط' : s.status}</small></div>)}</div> : <div className="empty-state">لا توجد اشتراكات للعميل.</div>}<button className="text-link button-link" type="button" onClick={() => void openAction('subscription')}>إضافة اشتراك</button></article>
        <article className="module-card"><span className="module-code">SALES</span><h3>مشتريات العميل</h3>{sales.length ? <div className="portal-data-list">{sales.slice(0, 8).map(s => <div className="portal-data-row" key={s.id}><strong>{s.saleNumber}</strong><span>{s.total} ر.س</span><small>{label(s.status)} · {new Date(s.createdAt).toLocaleDateString('ar-SA')} · {label(s.paymentStatus)}</small>{(s.status === 'completed' || s.status === 'partially_returned') && <button className="text-link button-link" type="button" disabled={saving} onClick={() => void openReturnSale(s)}>إرجاع البيع</button>}</div>)}</div> : <div className="empty-state">لا توجد مشتريات مرتبطة بالعميل.</div>}</article>
        <article className="module-card"><span className="module-code">ACTIVITY</span><h3>ملخص العميل</h3><div className="portal-data-list"><div className="portal-data-row"><strong>القياسات</strong><span>{measurements.length}</span></div><div className="portal-data-row"><strong>الخطط الغذائية</strong><span>{nutrition.length}</span></div><div className="portal-data-row"><strong>خطط اللياقة</strong><span>{fitness.length}</span></div><div className="portal-data-row"><strong>المواعيد</strong><span>{appointments.length}</span></div><div className="portal-data-row"><strong>المتابعات</strong><span>{followUps.length}</span></div><div className="portal-data-row"><strong>المبيعات</strong><span>{sales.length}</span></div></div></article>
      </section>
    </main>
  );
}
