import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';
import { useLanguage } from './i18n';

type User = { staffType?: string | null; permissions?: string[] };
type Appointment = {
  id: string; customerId: string; customerName: string; customerLastName: string;
  staffId: string; staffName: string; startsAt: string; endsAt: string;
  appointmentType: string; status: string; notes?: string | null;
};
type Option = { id: string; name: string; lastName?: string; customerNumber?: string; staffType?: string };

const statuses = [
  ['scheduled','مجدول','Scheduled'], ['confirmed','مؤكد','Confirmed'], ['completed','مكتمل','Completed'], ['cancelled','ملغي','Cancelled'], ['no_show','لم يحضر','No show'],
] as const;

export default function Appointments({ user }: { user: User }) {
  const { isArabic } = useLanguage();
  const t = (ar: string, en: string) => isArabic ? ar : en;
  const isAdmin = user.staffType === 'admin';
  const can = (p: string) => isAdmin || (user.permissions ?? []).includes(p);
  const canManage = can('appointments.manage');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [form, setForm] = useState({ customerId:'', staffId:'', startsAt:'', endsAt:'', appointmentType:'{t('استشارة','Consultation')}', status:'scheduled', notes:'' });
  const [editingId, setEditingId] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [a,o] = await Promise.all([
        apiFetch<{appointments:Appointment[]}>('/appointments'),
        apiFetch<{customers:Option[];staff:Option[]}>('/appointments/options'),
      ]);
      setAppointments(a.appointments); setCustomers(o.customers); setStaff(o.staff);
    } catch(e) { setError(e instanceof Error ? e.message : '{t('تعذر تحميل المواعيد','Unable to load appointments')}'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);

  function reset() {
    setEditingId('');
    setForm({ customerId:'', staffId:'', startsAt:'', endsAt:'', appointmentType:'{t('استشارة','Consultation')}', status:'scheduled', notes:'' });
  }
  function edit(item: Appointment) {
    setEditingId(item.id);
    setForm({
      customerId:item.customerId, staffId:item.staffId,
      startsAt:item.startsAt.slice(0,16), endsAt:item.endsAt.slice(0,16),
      appointmentType:item.appointmentType, status:item.status, notes:item.notes ?? '',
    });
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const body={...form, startsAt:new Date(form.startsAt).toISOString(), endsAt:new Date(form.endsAt).toISOString()};
      await apiFetch(editingId ? `/appointments/${editingId}` : '/appointments',{method:editingId?'PATCH':'POST',body:JSON.stringify(body)});
      setMessage(editingId ? '{t('تم تحديث الموعد','Appointment updated')}' : '{t('تم إنشاء الموعد','Appointment created')}');
      reset(); await load();
    } catch(e) { setError(e instanceof Error ? e.message : '{t('تعذر حفظ الموعد','Unable to save appointment')}'); }
    finally { setSaving(false); }
  }
  async function quickStatus(id:string,status:string) {
    try { await apiFetch(`/appointments/${id}`,{method:'PATCH',body:JSON.stringify({status})}); setMessage('{t('تم تحديث حالة الموعد','Appointment status updated')}'); await load(); }
    catch(e){setError(e instanceof Error ? e.message : '{t('تعذر تحديث الحالة','Unable to update status')}');}
  }

  const visible=appointments.filter(x=>filter==='all'||x.status===filter);
  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">{t('المواعيد','Appointments')}</span><h1>{t('المواعيد','Appointments')}</h1></div><Link className="secondary-button" to="/admin/dashboard">{t('لوحة الإدارة','Admin Dashboard')}</Link></header>
    {canManage && <section className="staff-management-grid">
      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">{t('الجدول','Schedule')}</p><h2>{editingId?t('{t('تعديل','Edit')} موعد','Edit Appointment'):t('موعد جديد','New Appointment')}</h2></div>{editingId&&<button className="secondary-button" type="button" onClick={reset}>{t('إلغاء ال{t('تعديل','Edit')}','Cancel Edit')}</button>}</div>
        <form className="form-stack" onSubmit={submit}>
          <label>{t('العميل','Customer')}<select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">{t('اختر العميل','Select customer')}</option>{customers.map(x=><option key={x.id} value={x.id}>{x.customerNumber} — {x.name} {x.lastName}</option>)}</select></label>
          <label>{t('المختص','Specialist')}<select required value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">{t('اختر المختص','Select specialist')}</option>{staff.map(x=><option key={x.id} value={x.id}>{x.name} — {x.staffType}</option>)}</select></label>
          <div className="form-row">
            <label>{t('بداية الموعد','Start time')}<input type="datetime-local" required value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label>
            <label>{t('نهاية الموعد','End time')}<input type="datetime-local" required value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></label>
          </div>
          <label>{t('نوع الموعد','Appointment type')}<input required value={form.appointmentType} onChange={e=>setForm({...form,appointmentType:e.target.value})}/></label>
          <label>{t('الحالة','Status')}<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(([v,l])=><option key={v} value={v}>{isArabic ? l : l === 'الكل' ? 'All' : l === 'مجدول' ? 'Scheduled' : l === 'مؤكد' ? 'Confirmed' : l === 'مكتمل' ? 'Completed' : l === 'ملغي' ? 'Cancelled' : 'No show'}</option>)}</select></label>
          <label>{t('ملاحظات','Notes')}<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
          <button className="primary-action button" disabled={saving}>{saving?t('جارٍ الحفظ...','Saving...'):editingId?t('حفظ ال{t('تعديل','Edit')}ات','Save changes'):t('حجز الموعد','Book appointment')}</button>
        </form>
      </section>
      <section className="panel">
        <p className="eyebrow">{t('اليوم والمواعيد القادمة','Today and upcoming')}</p><h2>{t('مواعيد المركز','Center appointments')}</h2>
        <div className="portal-choice-actions">{[['all','الكل','All'],...statuses].map(([v,l])=><button key={v} className={`secondary-button ${filter===v?'active':''}`} onClick={()=>setFilter(v)}>{isArabic ? l : l === 'الكل' ? 'All' : l === 'مجدول' ? 'Scheduled' : l === 'مؤكد' ? 'Confirmed' : l === 'مكتمل' ? 'Completed' : l === 'ملغي' ? 'Cancelled' : 'No show'}</button>)}</div>
      </section>
    </section>}
    {!canManage && <div className="info-strip warning">لديك صلاحية عرض المواعيد فقط. {t('تعديل','Edit')} المواعيد متاح للمستخدمين الذين لديهم صلاحية إدارة المواعيد.</div>}
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}
    <section className="panel">
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('التاريخ','Date')}</th><th>العميل</th><th>المختص</th><th>{t('النوع','Type')}</th><th>الحالة</th><th>{t('إجراء','Action')}</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={6}>{t('جارٍ تحميل المواعيد...','Loading appointments...')}</td></tr>:visible.length===0?<tr><td colSpan={6}>{t('لا توجد مواعيد.','No appointments found.')}</td></tr>:visible.map(x=><tr key={x.id}>
        <td>{new Date(x.startsAt).toLocaleString('ar-SA')}</td><td>{x.customerName} {x.customerLastName}</td><td>{x.staffName}</td><td>{x.appointmentType}</td><td>{(statuses.find(s=>s[0]===x.status)?.[isArabic ? 1 : 2] ?? x.status)}</td>
        <td>{canManage&&<><button className="secondary-button" onClick={()=>edit(x)}>{t('تعديل','Edit')}</button>{x.status==='scheduled'&&<button className="secondary-button" onClick={()=>void quickStatus(x.id,'confirmed')}>{t('تأكيد','Confirm')}</button>}{x.status==='confirmed'&&<button className="secondary-button" onClick={()=>void quickStatus(x.id,'completed')}>{t('إكمال','Complete')}</button>}</>}</td>
      </tr>)}</tbody></table></div>
    </section>
  </main>;
}
