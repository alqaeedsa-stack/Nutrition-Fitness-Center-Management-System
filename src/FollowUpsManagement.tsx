import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type Customer = { id: string; customerNumber: string; firstName: string; lastName: string };
type Staff = { id: string; name: string; staffType: string };
type FollowUp = {
  id: string; customerId: string; staffId: string; followUpAt: string; nextFollowUpAt?: string | null;
  weight?: string | null; height?: string | null; adherenceScore?: number | null;
  nutritionAdherenceScore?: number | null; fitnessAdherenceScore?: number | null;
  notes?: string | null; recommendations?: string | null; customerName: string;
  customerLastName: string; customerNumber: string; staffName: string;
};

export default function FollowUpsManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<FollowUp[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [adherenceScore, setAdherenceScore] = useState('');
  const [nutritionScore, setNutritionScore] = useState('');
  const [fitnessScore, setFitnessScore] = useState('');
  const [notes, setNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load(customerFilter = customerId) {
    try {
      const query = customerFilter ? '?customerId=' + encodeURIComponent(customerFilter) : '';
      const [options, data] = await Promise.all([
        apiFetch<{ customers: Customer[]; staff: Staff[] }>('/follow-ups/options'),
        apiFetch<{ followUps: FollowUp[] }>('/follow-ups' + query),
      ]);
      setCustomers(options.customers);
      setStaff(options.staff);
      setRows(data.followUps);
      if (!customerId && options.customers[0]) setCustomerId(options.customers[0].id);
      if (!staffId && options.staff[0]) setStaffId(options.staff[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المتابعات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiFetch(editingId ? '/follow-ups/' + editingId : '/follow-ups', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          customerId, staffId,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
          weight: weight || null, height: height || null,
          adherenceScore: adherenceScore || null,
          nutritionAdherenceScore: nutritionScore || null,
          fitnessAdherenceScore: fitnessScore || null,
          notes: notes || null, recommendations: recommendations || null,
        }),
      });
      setFollowUpAt(''); setNextFollowUpAt(''); setWeight(''); setHeight('');
      setAdherenceScore(''); setNutritionScore(''); setFitnessScore('');
      setNotes(''); setRecommendations('');
      setMessage(editingId ? 'تم تحديث المتابعة' : 'تم حفظ المتابعة');
      setEditingId(null);
      await load(customerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ المتابعة');
    } finally { setSaving(false); }
  }

  function editRow(r: FollowUp) {
    setEditingId(r.id); setCustomerId(r.customerId); setStaffId(r.staffId);
    setFollowUpAt(r.followUpAt ? new Date(r.followUpAt).toISOString().slice(0,16) : '');
    setNextFollowUpAt(r.nextFollowUpAt ? new Date(r.nextFollowUpAt).toISOString().slice(0,16) : '');
    setWeight(r.weight ?? ''); setHeight(r.height ?? '');
    setAdherenceScore(r.adherenceScore == null ? '' : String(r.adherenceScore));
    setNutritionScore(r.nutritionAdherenceScore == null ? '' : String(r.nutritionAdherenceScore));
    setFitnessScore(r.fitnessAdherenceScore == null ? '' : String(r.fitnessAdherenceScore));
    setNotes(r.notes ?? ''); setRecommendations(r.recommendations ?? '');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function deleteRow(id:string) {
    if(!window.confirm('هل تريد حذف سجل المتابعة؟')) return;
    try { await apiFetch('/follow-ups/'+id,{method:'DELETE'}); setMessage('تم حذف المتابعة'); await load(customerId); }
    catch(e){setError(e instanceof Error?e.message:'تعذر حذف المتابعة');}
  }

  const selectedCustomer = customers.find(c => c.id === customerId);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><span className="eyebrow">CUSTOMER FOLLOW-UP</span><h1>متابعة العملاء</h1><p>سجل متابعة دوري واضح داخل ملف العميل.</p></div>
        <div className="header-actions">
          <Link className="secondary-button" to={selectedCustomer ? '/admin/customers/' + selectedCustomer.id : '/admin/customers'}>ملف العميل</Link>
          <Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link>
        </div>
      </header>

      {error && <div className="info-strip warning">{error}</div>}
      {message && <div className="info-strip">{message}</div>}

      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">FOLLOW-UP</p><h2>{editingId ? 'تعديل المتابعة' : 'تسجيل متابعة'}</h2></div>{editingId && <button type="button" className="secondary-button" onClick={()=>setEditingId(null)}>إلغاء التعديل</button>}</div>
        <form className="form-stack" onSubmit={save}>
          <div className="form-row">
            <label>العميل<select required value={customerId} onChange={e => { setCustomerId(e.target.value); void load(e.target.value); }}>
              <option value="">اختر العميل</option>{customers.map(c => <option key={c.id} value={c.id}>{c.customerNumber} — {c.firstName} {c.lastName}</option>)}
            </select></label>
            <label>المختص / الموظف<select required value={staffId} onChange={e => setStaffId(e.target.value)}>
              <option value="">اختر الموظف</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
            <label>تاريخ المتابعة<input type="datetime-local" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} /></label>
            <label>المتابعة القادمة<input type="datetime-local" value={nextFollowUpAt} onChange={e => setNextFollowUpAt(e.target.value)} /></label>
          </div>

          <div className="form-row">
            <label>الوزن (كجم)<input type="number" min="0" step="0.01" value={weight} onChange={e => setWeight(e.target.value)} /></label>
            <label>الطول (سم)<input type="number" min="0" step="0.1" value={height} onChange={e => setHeight(e.target.value)} /></label>
            <label>الالتزام العام (%)<input type="number" min="0" max="100" step="1" value={adherenceScore} onChange={e => setAdherenceScore(e.target.value)} /></label>
            <label>الالتزام الغذائي (%)<input type="number" min="0" max="100" step="1" value={nutritionScore} onChange={e => setNutritionScore(e.target.value)} /></label>
            <label>الالتزام الرياضي (%)<input type="number" min="0" max="100" step="1" value={fitnessScore} onChange={e => setFitnessScore(e.target.value)} /></label>
          </div>

          <label>ملاحظات المتابعة<textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <label>التوصيات للعميل<textarea value={recommendations} onChange={e => setRecommendations(e.target.value)} /></label>
          <button className="primary-action button" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ المتابعة'}</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">HISTORY</p><h2>سجل المتابعة</h2></div><button className="secondary-button" onClick={() => void load(customerId)}>تحديث</button></div>
        {loading ? <div className="empty-state">جارٍ التحميل...</div> : rows.length === 0 ? <div className="empty-state">لا توجد متابعات لهذا العميل.</div> :
          <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>التاريخ</th><th>العميل</th><th>المختص</th><th>الوزن</th><th>الطول</th><th>الالتزام</th><th>المتابعة القادمة</th><th>التفاصيل</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id}>
              <td>{new Date(r.followUpAt).toLocaleString('ar-SA')}</td>
              <td>{r.customerNumber} — {r.customerName} {r.customerLastName}</td>
              <td>{r.staffName}</td>
              <td>{r.weight ? r.weight + ' كجم' : '—'}</td>
              <td>{r.height ? r.height + ' سم' : '—'}</td>
              <td>{r.adherenceScore == null ? '—' : r.adherenceScore + '%'}</td>
              <td>{r.nextFollowUpAt ? new Date(r.nextFollowUpAt).toLocaleDateString('ar-SA') : '—'}</td>
              <td><div className="header-actions"><button className="secondary-button" type="button" onClick={()=>editRow(r)}>تعديل</button><button className="secondary-button" type="button" onClick={()=>void deleteRow(r.id)}>حذف</button>{r.recommendations || r.notes ? <details><summary>عرض</summary><div><strong>الملاحظات:</strong> {r.notes || '—'}<br/><strong>التوصيات:</strong> {r.recommendations || '—'}</div></details> : '—'}</div></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </main>
  );
}
