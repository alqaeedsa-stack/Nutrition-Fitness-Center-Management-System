import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';

type ReportData = {
  from: string; to: string;
  summary: { salesCount: number; salesTotal: string; taxTotal: string; inventoryValue: string; lowStockCount: number };
  dailySales: { date: string; count: number; total: string }[];
  lowStock: { productId: string; sku: string; name: string; quantity: string; reorderPoint: string; purchaseCost: string }[];
};

function formatMoney(value: string | number) { return `${Number(value || 0).toFixed(2)} ر.س`; }

export default function Reports({ user }: { user: { staffType?: string | null; permissions?: string[] } }) {
  const isAdmin = user.staffType === 'admin';
  const canExport = isAdmin || (user.permissions ?? []).includes('reports.export');
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      if (from > to) { setError('تاريخ البداية يجب أن يسبق تاريخ النهاية.'); setLoading(false); return; }
      const result = await apiFetch<ReportData>('/staff/reports/summary?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
      setData(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل التقارير.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const exportCsv = () => {
    if (!data || !canExport) return;
    const rows = [['التاريخ', 'عدد المبيعات', 'إجمالي المبيعات'], ...data.dailySales.map(row => [row.date, String(row.count), row.total])];
    const csv = '\uFEFF' + rows.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'sales-report-' + data.from + '-' + data.to + '.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const maxDaily = useMemo(() => Math.max(...(data?.dailySales.map(row => Number(row.total)) ?? [0]), 1), [data]);
  return <main className="app-shell">
    <header className="app-header"><div><p className="eyebrow">REPORTS</p><h1>التقارير</h1><p>ملخص تشغيلي مبني على بيانات المركز الفعلية.</p></div><div className="header-actions"><Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link>{canExport && <button className="secondary-button" type="button" onClick={exportCsv} disabled={!data}>تصدير CSV</button>}</div></header>
    <section className="panel"><div className="customer-toolbar"><label>من <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>إلى <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><button className="primary-action button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'جارٍ التحميل...' : 'تحديث التقرير'}</button></div></section>
    {error && <div className="info-strip warning">{error}</div>}{loading && <div className="info-strip">جارٍ تحميل التقرير...</div>}
    {data && !loading && <><section className="module-grid">
      <article className="module-card"><span className="module-code">SALES</span><h3>إجمالي المبيعات</h3><strong>{formatMoney(data.summary.salesTotal)}</strong><small>{data.summary.salesCount} عملية بيع مكتملة</small></article>
      <article className="module-card"><span className="module-code">VAT</span><h3>الضريبة المسجلة</h3><strong>{formatMoney(data.summary.taxTotal)}</strong><small>ضمن عمليات البيع في الفترة</small></article>
      <article className="module-card"><span className="module-code">INVENTORY</span><h3>قيمة المخزون</h3><strong>{formatMoney(data.summary.inventoryValue)}</strong><small>بتكلفة الشراء الحالية</small></article>
      <article className="module-card"><span className="module-code">ALERTS</span><h3>منتجات تحت حد الطلب</h3><strong>{data.summary.lowStockCount}</strong><small>تحتاج مراجعة المخزون</small></article>
    </section>
    <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">DAILY SALES</p><h2>المبيعات اليومية</h2></div><span>{data.from} — {data.to}</span></div>
      {!data.dailySales.length ? <p className="empty-state">لا توجد مبيعات مكتملة في الفترة المحددة.</p> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>التاريخ</th><th>عدد العمليات</th><th>الإجمالي</th><th>مؤشر</th></tr></thead><tbody>{data.dailySales.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.count}</td><td>{formatMoney(row.total)}</td><td><div style={{minWidth:120}}><div style={{width: Math.max(4, Number(row.total) / maxDaily * 100) + '%', height:8, borderRadius:4, background:'currentColor'}} /></div></td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">LOW STOCK</p><h2>المنتجات التي تحتاج إعادة طلب</h2></div></div>
      {!data.lowStock.length ? <p className="empty-state">لا توجد منتجات تحت حد إعادة الطلب.</p> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>الرصيد</th><th>حد الطلب</th><th>قيمة التكلفة</th></tr></thead><tbody>{data.lowStock.map(row => <tr key={row.productId}><td>{row.sku}</td><td>{row.name}</td><td>{row.quantity}</td><td>{row.reorderPoint}</td><td>{formatMoney(Number(row.quantity) * Number(row.purchaseCost))}</td></tr>)}</tbody></table></div>}
    </section></>}
  </main>;
}