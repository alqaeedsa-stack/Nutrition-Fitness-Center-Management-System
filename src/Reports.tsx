import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './lib/api';
import { OdooReportViews } from './components/OdooERP';

type ReportData = {
  from: string;
  to: string;
  summary: {
    salesCount: number;
    salesTotal: string;
    taxTotal: string;
    returnedCount: number;
    returnedTotal: string;
    voidedCount: number;
    inventoryValue: string;
    lowStockCount: number;
    outOfStockCount: number;
  };
  dailySales: { date: string; count: number; total: string }[];
  paymentMethods: { paymentMethod: string; count: number; total: string }[];
  movementTotals: { movementType: string; quantity: string }[];
  lowStock: { productId: string; sku: string; name: string; quantity: string; reorderPoint: string; purchaseCost: string }[];
  outOfStock: { productId: string; sku: string; name: string; quantity: string; purchaseCost: string }[];
};

const paymentLabels: Record<string, string> = {
  cash: 'نقدي',
  mada: 'مدى',
  card: 'بطاقة',
  bank_transfer: 'تحويل بنكي',
  apple_pay: 'Apple Pay',
  cash_on_delivery: 'دفع عند الاستلام',
};

const movementLabels: Record<string, string> = {
  opening: 'رصيد افتتاحي',
  purchase: 'شراء',
  adjustment_in: 'تسوية إضافة',
  adjustment_out: 'تسوية صرف',
  return_in: 'مرتجع وارد',
  return_out: 'مرتجع صادر',
  sale: 'بيع',
  return: 'عكس بيع',
};

function formatMoney(value: string | number) {
  return `${Number(value || 0).toFixed(2)} ر.س`;
}

export default function Reports({ user }: { user: { staffType?: string | null; permissions?: string[] } }) {
  const isAdmin = user.staffType === 'admin';
  const canExport = isAdmin || (user.permissions ?? []).includes('reports.export');
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      if (from > to) {
        setError('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
        return;
      }
      setData(await apiFetch<ReportData>(`/staff/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل التقارير.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const exportCsv = () => {
    if (!data || !canExport) return;
    const rows = [
      ['القسم', 'البند', 'القيمة', 'الفترة'],
      ['المبيعات', 'إجمالي المبيعات', data.summary.salesTotal, `${data.from} — ${data.to}`],
      ['المبيعات', 'عدد العمليات', String(data.summary.salesCount), `${data.from} — ${data.to}`],
      ['المبيعات', 'الضريبة', data.summary.taxTotal, `${data.from} — ${data.to}`],
      ['المرتجعات', 'عدد العمليات المرتجعة', String(data.summary.returnedCount), `${data.from} — ${data.to}`],
      ['المرتجعات', 'قيمة العمليات المرتجعة', data.summary.returnedTotal, `${data.from} — ${data.to}`],
      ['المخزون', 'قيمة المخزون بالتكلفة', data.summary.inventoryValue, `${data.from} — ${data.to}`],
      ['المخزون', 'تحت حد الطلب', String(data.summary.lowStockCount), `${data.from} — ${data.to}`],
      ['المخزون', 'نفد المخزون', String(data.summary.outOfStockCount), `${data.from} — ${data.to}`],
      [],
      ['الدفع', 'الطريقة', 'عدد العمليات', 'الإجمالي'],
      ...data.paymentMethods.map(row => ['الدفع', paymentLabels[row.paymentMethod] ?? row.paymentMethod, String(row.count), row.total]),
      [],
      ['الحركة', 'نوع الحركة', 'الكمية', 'الفترة'],
      ...data.movementTotals.map(row => ['المخزون', movementLabels[row.movementType] ?? row.movementType, row.quantity, `${data.from} — ${data.to}`]),
      [],
      ['المبيعات اليومية', 'التاريخ', 'عدد العمليات', 'الإجمالي'],
      ...data.dailySales.map(row => ['المبيعات اليومية', row.date, String(row.count), row.total]),
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `center-report-${data.from}-${data.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <header className="app-header">
      <div><p className="eyebrow">التقارير</p><h1>التقارير التشغيلية</h1><p>ملخص مبني على بيانات المركز الفعلية، بدون بيانات تجريبية.</p></div>
      <div className="header-actions">
        <Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link>
        {canExport && <button className="secondary-button" type="button" onClick={exportCsv} disabled={!data}>تصدير CSV</button>}
      </div>
    </header>

    <section className="panel">
      <div className="customer-toolbar">
        <label>من <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>إلى <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="primary-action button" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'جارٍ التحميل...' : 'تحديث التقرير'}
        </button>
      </div>
    </section>

    {error && <div className="info-strip warning">{error}</div>}
    {loading && <div className="info-strip">جارٍ تحميل التقرير...</div>}

    {data && !loading && <>
      <section className="module-grid">
        <article className="module-card"><span className="module-code">SALES</span><h3>إجمالي المبيعات</h3><strong>{formatMoney(data.summary.salesTotal)}</strong><small>{data.summary.salesCount} عملية مكتملة</small></article>
        <article className="module-card"><span className="module-code">VAT</span><h3>الضريبة المسجلة</h3><strong>{formatMoney(data.summary.taxTotal)}</strong><small>ضمن المبيعات المكتملة</small></article>
        <article className="module-card"><span className="module-code">INVENTORY</span><h3>قيمة المخزون</h3><strong>{formatMoney(data.summary.inventoryValue)}</strong><small>بناءً على تكلفة الشراء الحالية</small></article>
        <article className="module-card"><span className="module-code">ALERTS</span><h3>تحت حد الطلب</h3><strong>{data.summary.lowStockCount}</strong><small>{data.summary.outOfStockCount} صنف نفد مخزونه</small></article>
      </section>

      <section className="module-grid">
        <article className="module-card"><span className="module-code">RETURNS</span><h3>المرتجعات</h3><strong>{data.summary.returnedCount}</strong><small>{formatMoney(data.summary.returnedTotal)} إجمالي العمليات المرتجعة</small></article>
        <article className="module-card"><span className="module-code">VOIDED</span><h3>المبيعات الملغاة</h3><strong>{data.summary.voidedCount}</strong><small>عمليات أُلغيت وعُكس مخزونها</small></article>
      </section>

      <section className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">مبيعات اليوم</p><h2>المبيعات اليومية</h2></div><span>{data.from} — {data.to}</span></div>
        {!data.dailySales.length ? <p className="empty-state">لا توجد مبيعات مكتملة في الفترة المحددة.</p> :
          <OdooReportViews rows={data.dailySales.map(row => ({ التاريخ: row.date, العمليات: row.count, الإجمالي: formatMoney(row.total), totalValue: Number(row.total) }))} valueKeys={['العمليات','totalValue']} />}
      </section>

      <section className="staff-management-grid">
        <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">المدفوعات</p><h2>طرق الدفع</h2></div></div>
          {!data.paymentMethods.length ? <p className="empty-state">لا توجد مبيعات مكتملة في الفترة.</p> :
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>طريقة الدفع</th><th>العمليات</th><th>الإجمالي</th></tr></thead><tbody>
              {data.paymentMethods.map(row => <tr key={row.paymentMethod}><td>{paymentLabels[row.paymentMethod] ?? row.paymentMethod}</td><td>{row.count}</td><td>{formatMoney(row.total)}</td></tr>)}
            </tbody></table></div>}
        </section>

        <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">حركات المخزون</p><h2>حركة المخزون</h2></div></div>
          {!data.movementTotals.length ? <p className="empty-state">لا توجد حركات مخزون في الفترة.</p> :
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الحركة</th><th>الكمية الصافية</th></tr></thead><tbody>
              {data.movementTotals.map(row => <tr key={row.movementType}><td>{movementLabels[row.movementType] ?? row.movementType}</td><td>{Number(row.quantity).toFixed(3)}</td></tr>)}
            </tbody></table></div>}
        </section>
      </section>

      <section className="staff-management-grid">
        <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">مخزون منخفض</p><h2>يحتاج إعادة طلب</h2></div></div>
          {!data.lowStock.length ? <p className="empty-state">لا توجد منتجات تحت حد إعادة الطلب.</p> :
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>الرصيد</th><th>الحد</th><th>القيمة</th></tr></thead><tbody>
              {data.lowStock.map(row => <tr key={row.productId}><td>{row.sku}</td><td>{row.name}</td><td>{row.quantity}</td><td>{row.reorderPoint}</td><td>{formatMoney(Number(row.quantity) * Number(row.purchaseCost))}</td></tr>)}
            </tbody></table></div>}
        </section>

        <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">نفاد المخزون</p><h2>نفد المخزون</h2></div></div>
          {!data.outOfStock.length ? <p className="empty-state">لا توجد منتجات نفد مخزونها.</p> :
            <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>الرصيد</th><th>القيمة</th></tr></thead><tbody>
              {data.outOfStock.map(row => <tr key={row.productId}><td>{row.sku}</td><td>{row.name}</td><td>{row.quantity}</td><td>{formatMoney(Number(row.quantity) * Number(row.purchaseCost))}</td></tr>)}
            </tbody></table></div>}
        </section>
      </section>
    </>}
  </main>;
}
