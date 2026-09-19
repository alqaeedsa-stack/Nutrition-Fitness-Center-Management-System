import { Link, useLocation } from 'react-router-dom';

export default function PurchaseWorkspaceNav(){
  const location=useLocation();
  const purchase=location.pathname==='/admin/purchases';
  const billing=location.pathname==='/admin/purchase-billing';
  const accounting=location.pathname==='/admin/accounting';
  return (
    <aside className="odoo-side-menu" aria-label="قائمة المشتريات">
      <div className="odoo-side-title">
        <span className="eyebrow">المشتريات</span>
        <strong>المشتريات</strong>
      </div>
      <nav className="odoo-side-links">
        <Link className={purchase?'selected':''} to="/admin/purchases">الموردون والمشتريات</Link>
        <Link className={billing?'selected':''} to="/admin/purchase-billing">الفواتير والمدفوعات</Link>
        <Link className={accounting?'selected':''} to="/admin/accounting">المحاسبة</Link>
        <Link to="/admin/operations">المنتجات والمخزون</Link>
      </nav>
      <div className="odoo-side-section">
        <span>دورة الشراء</span>
        <small>مورد → أمر شراء → استلام → فاتورة → دفع</small>
      </div>
    </aside>
  );
}
