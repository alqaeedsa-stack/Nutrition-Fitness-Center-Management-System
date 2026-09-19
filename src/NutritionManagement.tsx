import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type User = { id: string; staffType?: string | null; permissions?: string[] };
type Customer = { id: string; name: string; lastName: string; customerNumber: string };
type Specialist = { id: string; name: string; staffType: string };
type Item = { id: string; mealType: string; itemName: string; quantity?: string | null; unit?: string | null; calories?: string | null; notes?: string | null; sortOrder: number };
type Plan = { id: string; customerId: string; specialistId: string; title: string; goals?: string | null; startDate: string; endDate?: string | null; status: string; version: number; customerName: string; customerLastName: string; specialistName: string; items: Item[] };

export default function NutritionManagement({ user }: { user: User }) {
  const isAdmin = user.staffType === 'admin';
  const can = (p: string) => isAdmin || (user.permissions ?? []).includes(p);
  const canWrite = can('nutrition.write');
  const statusLabel: Record<string,string> = { draft:'مسودة', active:'نشطة', completed:'مكتملة', cancelled:'ملغاة' };
  const staffTypeLabel: Record<string,string> = { admin:'إدارة', doctor:'طبيب', nutritionist:'أخصائي تغذية', trainer:'مدرب', employee:'موظف', cashier:'كاشير', warehouse:'مخازن' };
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [planForm, setPlanForm] = useState({ customerId:'', specialistId:'', title:'', goals:'', startDate:new Date().toISOString().slice(0,10), endDate:'', status:'draft' });
  const [itemForm, setItemForm] = useState({ mealType:'وجبة رئيسية', itemName:'', quantity:'', unit:'', calories:'', notes:'' });
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);
  const [planSearch,setPlanSearch]=useState(''); const [statusFilter,setStatusFilter]=useState('all');

  async function load() {
    try {
      const [p,o] = await Promise.all([
        apiFetch<{plans:Plan[]}>('/nutrition'),
        apiFetch<{customers:Customer[];specialists:Specialist[]}>('/nutrition/options'),
      ]);
      setPlans(p.plans); setCustomers(o.customers); setSpecialists(o.specialists);
      if (!planForm.customerId && o.customers[0]) setPlanForm(v=>({...v,customerId:o.customers[0].id}));
      if (!planForm.specialistId && o.specialists[0]) setPlanForm(v=>({...v,specialistId:o.specialists[0].id}));
    } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الخطط الغذائية');}
  }
  useEffect(()=>{void load()},[]);

  async function createPlan(e:FormEvent) {
    e.preventDefault(); if(!canWrite)return; setSaving(true); setError(''); setMessage('');
    try {
      const r=await apiFetch<{plan:Plan}>('/nutrition',{method:'POST',body:JSON.stringify({...planForm,endDate:planForm.endDate||null})});
      setSelectedId(r.plan.id); setMessage('تم إنشاء الخطة الغذائية'); setPlanForm(v=>({...v,title:'',goals:'',endDate:'',status:'draft'})); await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء الخطة');} finally{setSaving(false);}
  }

  async function addItem(e:FormEvent) {
    e.preventDefault(); if(!canWrite || !selectedId)return; setSaving(true); setError(''); setMessage('');
    try {
      await apiFetch('/nutrition/'+selectedId+'/items',{method:'POST',body:JSON.stringify({...itemForm,quantity:itemForm.quantity||null,calories:itemForm.calories||null,sortOrder:(plans.find(p=>p.id===selectedId)?.items.length??0)})});
      setItemForm({mealType:'وجبة رئيسية',itemName:'',quantity:'',unit:'',calories:'',notes:''}); setMessage('تمت إضافة الوجبة'); await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر إضافة الوجبة');} finally{setSaving(false);}
  }

  async function deleteItem(itemId:string) {
    if(!canWrite || !selectedId)return;
    try{await apiFetch('/nutrition/'+selectedId+'/items/'+itemId,{method:'DELETE'});setMessage('تم حذف عنصر الخطة');await load();}
    catch(e){setError(e instanceof Error?e.message:'تعذر حذف العنصر');}
  }

  const filteredPlans=plans.filter(p=>{const q=planSearch.trim().toLowerCase();return (statusFilter==='all'||p.status===statusFilter)&&(!q||(p.title+' '+p.customerName+' '+p.customerLastName+' '+p.specialistName).toLowerCase().includes(q));});
  const planKpis=[['إجمالي الخطط',plans.length],['مسودة',plans.filter(p=>p.status==='draft').length],['نشطة',plans.filter(p=>p.status==='active').length],['مكتملة',plans.filter(p=>p.status==='completed').length]] as const;
  const selected=plans.find(p=>p.id===selectedId);
  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">التغذية</span><h1>الخطط الغذائية</h1></div><Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link></header>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}
    <section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">خطة جديدة</p><h2>إنشاء خطة</h2><form className="form-stack" onSubmit={createPlan}>
        <label>العميل<select required disabled={!canWrite} value={planForm.customerId} onChange={e=>setPlanForm({...planForm,customerId:e.target.value})}>{customers.map(x=><option key={x.id} value={x.id}>{x.customerNumber} — {x.name} {x.lastName}</option>)}</select></label>
        <label>الأخصائي<select required disabled={!canWrite} value={planForm.specialistId} onChange={e=>setPlanForm({...planForm,specialistId:e.target.value})}>{specialists.map(x=><option key={x.id} value={x.id}>{x.name} — {staffTypeLabel[x.staffType] ?? x.staffType}</option>)}</select></label>
        <label>اسم الخطة<input required disabled={!canWrite} value={planForm.title} onChange={e=>setPlanForm({...planForm,title:e.target.value})} placeholder="خطة خفض الوزن — المرحلة الأولى"/></label>
        <label>الهدف<textarea disabled={!canWrite} value={planForm.goals} onChange={e=>setPlanForm({...planForm,goals:e.target.value})} /></label>
        <div className="form-row"><label>تاريخ البداية<input type="date" required disabled={!canWrite} value={planForm.startDate} onChange={e=>setPlanForm({...planForm,startDate:e.target.value})}/></label><label>تاريخ النهاية<input type="date" disabled={!canWrite} value={planForm.endDate} onChange={e=>setPlanForm({...planForm,endDate:e.target.value})}/></label></div>
        <label>الحالة<select disabled={!canWrite} value={planForm.status} onChange={e=>setPlanForm({...planForm,status:e.target.value})}><option value="draft">مسودة</option><option value="active">نشطة</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option></select></label>
        {canWrite&&<button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'إنشاء الخطة'}</button>}
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">الخطط</p><h2>الخطط الحالية</h2></div><button className="secondary-button" onClick={()=>void load()}>تحديث</button></div>
        <div className="erp-kpi-strip">{planKpis.map(([label,value])=><div className="erp-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <div className="module-toolbar"><div className="toolbar-filters"><input value={planSearch} onChange={e=>setPlanSearch(e.target.value)} placeholder="بحث باسم الخطة أو العميل أو الأخصائي"/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">كل الحالات</option>{Object.entries(statusLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div></div>
        {!filteredPlans.length?<p className="empty-state">لا توجد خطط مطابقة.</p>:<div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الخطة</th><th>العميل</th><th>الأخصائي</th><th>البداية</th><th>الحالة</th><th></th></tr></thead><tbody>{filteredPlans.map(p=><tr key={p.id}><td>{p.title}<small> الإصدار {p.version}</small></td><td>{p.customerName} {p.customerLastName}</td><td>{p.specialistName}</td><td>{p.startDate}</td><td>{statusLabel[p.status] ?? p.status}</td><td><button className="secondary-button" onClick={()=>setSelectedId(p.id)}>فتح</button></td></tr>)}</tbody></table></div>}
      </section>
    </section>
    {selected&&<section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">تفاصيل الخطة</p><h2>{selected.title}</h2><p>{selected.customerName} {selected.customerLastName} · {selected.specialistName}</p></div></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>نوع الوجبة</th><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعرات</th><th></th></tr></thead><tbody>{selected.items.map(i=><tr key={i.id}><td>{i.mealType}</td><td>{i.itemName}</td><td>{i.quantity??'—'}</td><td>{i.unit??'—'}</td><td>{i.calories??'—'}</td><td>{canWrite&&<button className="secondary-button" onClick={()=>void deleteItem(i.id)}>حذف</button>}</td></tr>)}</tbody></table></div>
      {canWrite&&<form className="form-stack" onSubmit={addItem} style={{marginTop:16}}><h3>إضافة وجبة / عنصر</h3><div className="form-row"><label>نوع الوجبة<input value={itemForm.mealType} onChange={e=>setItemForm({...itemForm,mealType:e.target.value})}/></label><label>الصنف<input required value={itemForm.itemName} onChange={e=>setItemForm({...itemForm,itemName:e.target.value})}/></label></div><div className="form-row"><label>الكمية<input type="number" min="0" step="0.01" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})}/></label><label>الوحدة<input value={itemForm.unit} onChange={e=>setItemForm({...itemForm,unit:e.target.value})} placeholder="جرام / حبة / مل"/></label><label>السعرات<input type="number" min="0" step="1" value={itemForm.calories} onChange={e=>setItemForm({...itemForm,calories:e.target.value})}/></label></div><label>ملاحظات<textarea value={itemForm.notes} onChange={e=>setItemForm({...itemForm,notes:e.target.value})}/></label><button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'إضافة العنصر'}</button></form>}
    </section>}
  </main>;
}
