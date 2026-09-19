import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export type ERPView = 'list' | 'kanban' | 'form' | 'pivot' | 'graph';

type Breadcrumb = { label: string; to?: string };
type Action = { label: string; onClick: () => void; disabled?: boolean };

export function OdooBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  return <nav className="erp-breadcrumbs" aria-label="Breadcrumb">
    {items.map((item, index) => <span key={item.label + index}>
      {index > 0 && <b aria-hidden="true">/</b>}
      {item.to ? <Link to={item.to}>{item.label}</Link> : <strong>{item.label}</strong>}
    </span>)}
  </nav>;
}

export function OdooActionMenu({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  return <div className="erp-action-menu">
    <button className="secondary-button" type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>إجراءات ▾</button>
    {open && <div className="erp-action-menu-popover">
      {actions.map(action => <button key={action.label} type="button" disabled={action.disabled} onClick={() => { setOpen(false); action.onClick(); }}>{action.label}</button>)}
    </div>}
  </div>;
}

export function OdooViewSwitcher({ value, onChange, views = ['list','kanban','form'] as ERPView[] }: { value: ERPView; onChange: (v: ERPView) => void; views?: ERPView[] }) {
  const labels: Record<ERPView,string> = { list:'قائمة', kanban:'كانبان', form:'نموذج', pivot:'Pivot', graph:'Graph' };
  return <div className="erp-view-switcher" role="tablist" aria-label="طرق العرض">
    {views.map(v => <button key={v} type="button" className={value === v ? 'active' : ''} onClick={() => onChange(v)} role="tab" aria-selected={value === v}>{labels[v]}</button>)}
  </div>;
}

export function ERPModuleNav({ title }: { title: string }) {
  const groups: Record<string, { label: string; to: string }[]> = {
    'العملاء': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'المواعيد': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'متابعة العملاء': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'القياسات': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'الخطط الغذائية': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'الخطط الرياضية': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'الموردون والمشتريات': [
      { label: 'الموردون والمشتريات', to: '/admin/purchases' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
      { label: 'المنتجات والمخزون', to: '/admin/operations' },
      { label: 'نقطة البيع', to: '/admin/pos' },
    ],
    'فواتير ومدفوعات الموردين': [
      { label: 'الموردون والمشتريات', to: '/admin/purchases' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
      { label: 'المنتجات والمخزون', to: '/admin/operations' },
      { label: 'نقطة البيع', to: '/admin/pos' },
    ],
    'المنتجات والمخزون والطلبات': [
      { label: 'المنتجات والمخزون', to: '/admin/operations' },
      { label: 'نقطة البيع', to: '/admin/pos' },
      { label: 'الموردون والمشتريات', to: '/admin/purchases' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
    ],
    'نقطة البيع': [
      { label: 'نقطة البيع', to: '/admin/pos' },
      { label: 'المنتجات والمخزون', to: '/admin/operations' },
      { label: 'الموردون والمشتريات', to: '/admin/purchases' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
    ],
    'ملف العميل': [
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
      { label: 'المتابعات', to: '/admin/follow-ups' },
      { label: 'القياسات', to: '/admin/measurements' },
      { label: 'الخطط الغذائية', to: '/admin/nutrition' },
      { label: 'الخطط الرياضية', to: '/admin/fitness' },
    ],
    'الموظفون': [
      { label: 'الموظفون', to: '/admin/staff' },
      { label: 'العملاء', to: '/admin/customers' },
      { label: 'المواعيد', to: '/admin/appointments' },
    ],
    'المحاسبة': [
      { label: 'المحاسبة', to: '/admin/accounting' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
      { label: 'التقارير', to: '/admin/reports' },
      { label: 'الضرائب والفوترة الإلكترونية', to: '/admin/zatca' },
    ],
    'التقارير': [
      { label: 'التقارير', to: '/admin/reports' },
      { label: 'المحاسبة', to: '/admin/accounting' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
      { label: 'الضرائب والفوترة الإلكترونية', to: '/admin/zatca' },
    ],
    'الضرائب والفوترة الإلكترونية': [
      { label: 'الضرائب والفوترة الإلكترونية', to: '/admin/zatca' },
      { label: 'المحاسبة', to: '/admin/accounting' },
      { label: 'التقارير', to: '/admin/reports' },
      { label: 'فواتير الموردين', to: '/admin/purchase-billing' },
    ],
  };
  const items = groups[title] ?? [];
  if (!items.length) return null;
  return <nav className="erp-module-nav" aria-label="تنقل الوحدة">
    {items.map(item => <Link key={item.to} className={item.label === title ? 'active' : ''} to={item.to}>{item.label}</Link>)}
  </nav>;
}

export function OdooSearchToolbar({ value, onChange, placeholder = 'بحث...', filters = [], onFilter }: { value: string; onChange: (v: string) => void; placeholder?: string; filters?: string[]; onFilter?: (v: string) => void }) {
  return <div className="erp-search-toolbar">
    <div className="erp-search-input"><span aria-hidden="true">⌕</span><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>
    <select defaultValue="" onChange={e => onFilter?.(e.target.value)} aria-label="التصفية">
      <option value="">كل السجلات</option>{filters.map(f => <option key={f} value={f}>{f}</option>)}
    </select>
    <button className="secondary-button" type="button" onClick={() => onFilter?.('group')}>تجميع</button>
  </div>;
}

export function OdooStatusbar({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  return <div className="odoo-statusbar" aria-label="حالة السجل">{steps.map(step => <span key={step.key} className={step.key === current ? 'current' : ''}>{step.label}</span>)}</div>;
}

export function OdooSmartButtons({ buttons }: { buttons: { label: string; value?: string | number; onClick?: () => void }[] }) {
  return <div className="erp-smart-buttons">{buttons.map(button => <button key={button.label} type="button" onClick={button.onClick} disabled={!button.onClick}>
    <strong>{button.value ?? '—'}</strong><span>{button.label}</span>
  </button>)}</div>;
}

export function OdooChatter({ activities = [], notes = [] }: { activities?: { title: string; date?: string; detail?: string }[]; notes?: string[] }) {
  return <aside className="erp-chatter">
    <div className="erp-chatter-head"><strong>سجل النشاط</strong><span>{activities.length + notes.length}</span></div>
    <div className="erp-chatter-body">
      {notes.map((note, i) => <article key={'n' + i}><b>ملاحظة</b><p>{note}</p></article>)}
      {activities.map((activity, i) => <article key={'a' + i}><b>{activity.title}</b><small>{activity.date ?? ''}</small>{activity.detail && <p>{activity.detail}</p>}</article>)}
      {!activities.length && !notes.length && <div className="empty-state">لا توجد أنشطة مسجلة بعد.</div>}
    </div>
  </aside>;
}

export function OdooWizard({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return <div className="erp-wizard-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="erp-wizard" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="secondary-button" onClick={onClose}>إغلاق</button></header>
      <div className="erp-wizard-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  </div>;
}

export function OdooKanban({ children }: { children: ReactNode }) {
  return <div className="erp-kanban-grid">{children}</div>;
}

export function OdooKanbanCard({ title, subtitle, status, children, onClick }: { title: string; subtitle?: string; status?: string; children?: ReactNode; onClick?: () => void }) {
  return <article className="erp-kanban-card" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
    <div className="erp-kanban-card-head"><strong>{title}</strong>{status && <span className="status-badge">{status}</span>}</div>
    {subtitle && <small>{subtitle}</small>}{children && <div className="erp-kanban-card-body">{children}</div>}
  </article>;
}

export function OdooReportViews({ rows, valueKeys }: { rows: Record<string, unknown>[]; valueKeys: string[] }) {
  const [view, setView] = useState<ERPView>('pivot');
  const dimensionKeys = useMemo(() => {
    const keys = Object.keys(rows[0] ?? {});
    return keys.filter(key => !valueKeys.includes(key));
  }, [rows, valueKeys]);
  const [groupKey, setGroupKey] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    setGroupKey(current => current && dimensionKeys.includes(current) ? current : (dimensionKeys[0] ?? ''));
    setSelectedGroup(null);
  }, [dimensionKeys.join('|')]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; count: number; values: Record<string, number>; rows: Record<string, unknown>[] }>();
    for (const row of rows) {
      const key = groupKey ? String(row[groupKey] ?? 'غير محدد') : 'الإجمالي';
      const existing = map.get(key) ?? { key, count: 0, values: {}, rows: [] };
      existing.count += 1;
      existing.rows.push(row);
      for (const valueKey of valueKeys) existing.values[valueKey] = (existing.values[valueKey] ?? 0) + (Number(row[valueKey]) || 0);
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [rows, groupKey, valueKeys]);

  const selectedRows = selectedGroup ? (grouped.find(item => item.key === selectedGroup)?.rows ?? []) : [];
  const graphValueKey = valueKeys[0] ?? '';
  const graphMax = Math.max(1, ...grouped.map(item => Math.abs(item.values[graphValueKey] ?? 0)));

  return <section className="erp-report-views">
    <div className="module-toolbar erp-report-toolbar">
      <OdooViewSwitcher value={view} onChange={setView} views={['pivot','graph','list']} />
      {dimensionKeys.length > 0 && <select value={groupKey} onChange={e => { setGroupKey(e.target.value); setSelectedGroup(null); }} aria-label="التجميع">
        {dimensionKeys.map(key => <option key={key} value={key}>تجميع حسب {key}</option>)}
      </select>}
      {view !== 'list' && <button className="secondary-button" type="button" onClick={() => setSelectedGroup(null)} disabled={!selectedGroup}>إلغاء التحديد</button>}
    </div>

    {view === 'list' && <div className="staff-table-wrap">
      <table className="staff-table">
        <thead><tr>{Object.keys(rows[0] ?? {}).map(key => <th key={key}>{key}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{Object.keys(rows[0] ?? {}).map(key => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>}

    {view === 'pivot' && <div className="erp-pivot-wrap">
      <div className="erp-pivot">
        <div><strong>المجموع</strong><b>{rows.length}</b></div>
        {valueKeys.map(key => <div key={key}><strong>{key}</strong><b>{rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0).toFixed(2)}</b></div>)}
      </div>
      <div className="staff-table-wrap">
        <table className="staff-table">
          <thead><tr><th>{groupKey || 'المجموعة'}</th><th>عدد السجلات</th>{valueKeys.map(key => <th key={key}>{key}</th>)}</tr></thead>
          <tbody>
            {grouped.map(item => <tr key={item.key} className={selectedGroup === item.key ? 'erp-report-selected' : ''} onClick={() => setSelectedGroup(item.key)}>
              <td><button className="table-link-button" type="button" onClick={() => setSelectedGroup(item.key)}>{item.key}</button></td>
              <td>{item.count}</td>
              {valueKeys.map(key => <td key={key}>{item.values[key]?.toFixed(2) ?? '0.00'}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {view === 'graph' && <div className="erp-graph-wrap">
      <div className="erp-graph-summary"><strong>{graphValueKey || 'القيمة'}</strong><span>{grouped.length} مجموعة</span></div>
      <div className="erp-graph" role="img" aria-label={`رسم بياني مجمع حسب ${groupKey || 'السجلات'}`}>
        {grouped.map(item => {
          const value = Math.abs(item.values[graphValueKey] ?? 0);
          const height = Math.max(8, value / graphMax * 180);
          return <button className="erp-bar" key={item.key} type="button" style={{ height }} title={`${item.key}: ${value.toFixed(2)}`} onClick={() => setSelectedGroup(item.key)}>
            <span>{value.toFixed(0)}</span><small>{item.key}</small>
          </button>;
        })}
      </div>
    </div>}

    {selectedGroup && <div className="erp-report-drilldown">
      <div className="panel-heading-row"><div><p className="eyebrow">تفاصيل المجموعة</p><h3>{selectedGroup}</h3></div><span>{selectedRows.length} سجل</span></div>
      <div className="staff-table-wrap">
        <table className="staff-table">
          <thead><tr>{Object.keys(rows[0] ?? {}).map(key => <th key={key}>{key}</th>)}</tr></thead>
          <tbody>{selectedRows.map((row, index) => <tr key={index}>{Object.keys(rows[0] ?? {}).map(key => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}
