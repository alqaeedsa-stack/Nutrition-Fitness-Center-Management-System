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
  ['scheduled','مجدول'], ['confirmed','مؤكد'], ['completed','مكتمل'], ['cancelled','ملغي'], ['no_show','لم يحضر'],
] as const;

export default function Appointments({ user }: { user: User }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const isAdmin = user.staffType === 'admin';
  const can = (p: string) => isAdmin || (user.permissions ?? []).includes(p);
  const canManage = can('appointments.manage');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [form, setForm] = useState({ customerId:'', staffId:'', startsAt:'', endsAt:'', appointmentType:'استشارة', status:'scheduled', notes:'' });
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
    } catch(e) { setError(e instanceof Error ? e.message : 'تعذر تحميل المواعيد'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);

  function reset() {
    setEditingId('');
    setForm({ customerId:'', staffId:'', startsAt:'', endsAt:'', appointmentType:'استشارة', status:'scheduled', notes:'' });
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
      setMessage(editingId ? '{en ? 'Appointment updated' : 'تم تحديث الموعد'}' : '{en ? 'Appointment created' : 'تم إنشاء الموعد'}');
      reset(); await load();
    } catch(e) { setError(e instanceof Error ? e.message : 'تعذر حفظ الموعد'); }
    finally { setSaving(false); }
  }
  async function quickStatus(id:string,status:string) {
    try { await apiFetch(`/appointments/${id}`,{method:'PATCH',body:JSON.stringify({status})}); setMessage('{en ? 'Appointment status updated' : 'تم تحديث حالة الموعد'}'); await load(); }
    catch(e){setError(e instanceof Error ? e.message : 'تعذر تحديث {en ? 'Status' : 'الحالة'}');}
  }

  const visible=appointments.filter(x=>filter==='all'||x.status===filter);
  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">{en ? 'Appointments' : 'المواعيد'}</span><h1>{en ? 'Appointments' : 'المواعيد'}</h1></div><Link className="secondary-button" to="/admin/dashboard">{en ? 'Dashboard' : 'لوحة الإدارة'}</Link></header>
    {canManage && <section className="staff-management-grid">
      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">{en ? 'Schedule' : 'الجدول'}</p><h2>{editingId?'{en ? 'Edit Appointment' : 'تعديل موعد'}':'{en ? 'New Appointment' : 'موعد جديد'}'}</h2></div>{editingId&&<button className="secondary-button" type="button" onClick={reset}>{en ? 'Cancel Edit' : 'إلغاء التعديل'}</button>}</div>
        <form className="form-stack" onSubmit={submit}>
          <label>{en ? 'Customer' : 'العميل'}<select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">اختر {en ? 'Customer' : 'العميل'}</option>{customers.map(x=><option key={x.id} value={x.id}>{x.customerNumber} — {x.name} {x.lastName}</option>)}</select></label>
          <label>{en ? 'Staff Member' : 'المختص'}<select required value={form.staffId} onChange={e=>setForm({...form,staffId:e.target.value})}><option value="">اختر {en ? 'Staff Member' : 'المختص'}</option>{staff.map(x=><option key={x.id} value={x.id}>{x.name} — {x.staffType}</option>)}</select></label>
          <div className="form-row">
            <label>{en ? 'Start' : 'بداية الموعد'}<input type="datetime-local" required value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label>
            <label>{en ? 'End' : 'نهاية الموعد'}<input type="datetime-local" required value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></label>
          </div>
          <label>{en ? 'Appointment Type' : 'نوع الموعد'}<input required value={form.appointmentType} onChange={e=>setForm({...form,appointmentType:e.target.value})}/></label>
          <label>{en ? 'Status' : 'الحالة'}<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label>{en ? 'Notes' : 'ملاحظات'}<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
          <button className="primary-action button" disabled={saving}>{saving?'{en ? 'Saving...' : 'جارٍ الحفظ...'}':editingId?'{en ? 'Save Changes' : 'حفظ التعديلات'}':'{en ? 'Book Appointment' : 'حجز الموعد'}'}</button>
        </form>
      </section>
      <section className="panel">
        <p className="eyebrow">{en ? 'Today & Upcoming' : 'اليوم والمواعيد القادمة'}</p><h2>{en ? 'Center Appointments' : 'مواعيد المركز'}</h2>
        <div className="portal-choice-actions">{[['all','{en ? 'All' : 'الكل'}'],...statuses].map(([v,l])=><button key={v} className={`secondary-button ${filter===v?'active':''}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
      </section>
    </section>}
    {!canManage && <div className="info-strip warning">{en ? 'You can view appointments only. Editing requires appointment management permission.' : 'لديك صلاحية عرض المواعيد فقط. تعديل المواعيد متاح للمستخدمين الذين لديهم صلاحية إدارة المواعيد.'}</div>}
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}
    <section className="panel">
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>التاريخ</th><th>{en ? 'Customer' : 'العميل'}</th><th>{en ? 'Staff Member' : 'المختص'}</th><th>النوع</th><th>{en ? 'Status' : 'الحالة'}</th><th>إجراء</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={6}>جارٍ تحميل المواعيد...</td></tr>:visible.length===0?<tr><td colSpan={6}>لا توجد مواعيد.</td></tr>:visible.map(x=><tr key={x.id}>
        <td>{new Date(x.startsAt).toLocaleString('ar-SA')}</td><td>{x.customerName} {x.customerLastName}</td><td>{x.staffName}</td><td>{x.appointmentType}</td><td>{statuses.find(s=>s[0]===x.status)?.[1]??x.status}</td>
        <td>{canManage&&<><button className="secondary-button" onClick={()=>edit(x)}>تعديل</button>{x.status==='scheduled'&&<button className="secondary-button" onClick={()=>void quickStatus(x.id,'confirmed')}>تأكيد</button>}{x.status==='confirmed'&&<button className="secondary-button" onClick={()=>void quickStatus(x.id,'completed')}>إكمال</button>}</>}</td>
      </tr>)}</tbody></table></div>
    </section>
  </main>;
}
