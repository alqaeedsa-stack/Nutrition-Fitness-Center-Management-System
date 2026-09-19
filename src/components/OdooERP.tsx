import { ReactNode, useMemo, useState } from 'react';
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
  const [groupKey, setGroupKey] = useState(valueKeys[0] ?? '');
  const numeric = useMemo(() => rows.map(row => valueKeys.reduce((s, k) => s + (Number(row[k]) || 0), 0)), [rows, valueKeys]);
  return <section className="erp-report-views">
    <div className="module-toolbar"><OdooViewSwitcher value={view} onChange={setView} views={['pivot','graph','list']} />
      <select value={groupKey} onChange={e => setGroupKey(e.target.value)}>{valueKeys.map(k => <option key={k} value={k}>تجميع حسب {k}</option>)}</select>
    </div>
    {view === 'list' && <div className="staff-table-wrap"><table className="staff-table"><thead><tr>{Object.keys(rows[0] ?? {}).map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{Object.keys(rows[0] ?? {}).map(k=><td key={k}>{String(row[k] ?? '')}</td>)}</tr>)}</tbody></table></div>}
    {view === 'pivot' && <div className="erp-pivot"><div><strong>عدد السجلات</strong><b>{rows.length}</b></div><div><strong>{groupKey || 'القيمة'}</strong><b>{numeric.reduce((a,b)=>a+b,0).toFixed(2)}</b></div></div>}
    {view === 'graph' && <div className="erp-graph">{numeric.map((n,i)=><div className="erp-bar" key={i} style={{height: Math.max(8, Math.min(180, Math.abs(n) / Math.max(1, Math.max(...numeric)) * 180))}}><span>{n.toFixed(0)}</span></div>)}</div>}
  </section>;
}
