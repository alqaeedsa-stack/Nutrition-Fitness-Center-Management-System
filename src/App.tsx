import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Customers from './Customers';
import Appointments from './Appointments';
import NutritionManagement from './NutritionManagement';
import FitnessManagement from './FitnessManagement';
import MeasurementsManagement from './MeasurementsManagement';
import FollowUpsManagement from './FollowUpsManagement';
import Customer360 from './Customer360';
import CustomerPortal from './CustomerPortal';
import { ForgotPassword, ResetPassword } from './PasswordReset';
import { apiFetch } from './lib/api';
import StaffManagement from './StaffManagement';
import ZatcaSettings from './ZatcaSettings';
import Reports from './Reports';

type AuthUser = {
  id: string;
  centerId?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  role: 'customer' | 'staff';
  staffType?: 'admin' | 'doctor' | 'nutritionist' | 'trainer' | 'employee' | 'cashier' | 'warehouse' | null;
  permissions?: string[];
};

type LoginPortal = 'customer' | 'staff';

const countryCodes = [
  ['966', 'السعودية'], ['971', 'الإمارات'], ['965', 'الكويت'], ['974', 'قطر'], ['973', 'البحرين'], ['968', 'عُمان'],
  ['20', 'مصر'], ['962', 'الأردن'], ['961', 'لبنان'], ['964', 'العراق'], ['212', 'المغرب'], ['213', 'الجزائر'],
  ['216', 'تونس'], ['218', 'ليبيا'], ['249', 'السودان'], ['1', 'الولايات المتحدة / كندا'], ['44', 'المملكة المتحدة'],
  ['33', 'فرنسا'], ['49', 'ألمانيا'], ['39', 'إيطاليا'], ['34', 'إسبانيا'], ['90', 'تركيا'], ['91', 'الهند'],
  ['92', 'باكستان'], ['880', 'بنغلاديش'], ['60', 'ماليزيا'], ['65', 'سنغافورة'], ['81', 'اليابان'], ['82', 'كوريا الجنوبية'],
  ['86', 'الصين'], ['61', 'أستراليا'], ['64', 'نيوزيلندا'], ['27', 'جنوب أفريقيا']
] as const;

function Login({ onLogin, portal }: { onLogin: (user: AuthUser) => void; portal: LoginPortal }) {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isStaff = portal === 'staff';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{ user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, portal }),
      });
      onLogin(result.user);
      navigate(isStaff ? '/admin/dashboard' : '/customer/home', { replace: true });
    } catch {
      setError(isStaff
        ? 'تعذر الدخول إلى بوابة الإدارة والموظفين. تحقق من البريد/الجوال وكلمة المرور.'
        : 'تعذر الدخول إلى بوابة العملاء. تحقق من البريد الإلكتروني وكلمة المرور.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="portal-back" to={isStaff ? '/admin' : '/customer'}>← العودة إلى {isStaff ? 'بوابة الإدارة' : 'بوابة العملاء'}</Link>
        <div className="brand-mark small">N</div>
        <div className="brand-block">
          <span className="eyebrow">{isStaff ? 'STAFF & MANAGEMENT PORTAL' : 'CUSTOMER PORTAL'}</span>
          <h1>{isStaff ? 'دخول الإدارة والموظفين' : 'دخول العملاء'}</h1>
          <p>{isStaff
            ? 'بوابة العمل الداخلية للإدارة والأطباء والأخصائيين والموظفين.'
            : 'بوابة العميل الخاصة بالحساب والخطط والمواعيد والمشتريات والمتجر.'}</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            {isStaff ? 'البريد الإلكتروني أو الجوال' : 'البريد الإلكتروني'}
            <input type={isStaff ? 'text' : 'email'} value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required />
          </label>
          <label className="password-field">
            كلمة المرور
            <div className="password-input-wrap">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? 'إخفاء' : 'عرض'}
              </button>
            </div>
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-action button" type="submit" disabled={loading}>
            {loading ? 'جارٍ التحقق...' : 'دخول البوابة'}
          </button>
        </form>
        {!isStaff && (
          <>
            <div className="auth-switch"><Link className="text-link" to="/customer/forgot-password">نسيت كلمة المرور؟</Link></div>
            <div className="auth-switch">ليس لديك حساب؟ <Link className="text-link" to="/customer/register">تسجيل عميل جديد</Link></div>
          </>
        )}
        <div className="auth-switch">
          {isStaff
            ? <>عميل؟ <Link className="text-link" to="/customer/login">دخول العملاء والمتجر</Link></>
            : <>إدارة أو موظف؟ <Link className="text-link" to="/admin/login">دخول الإدارة والموظفين</Link></>}
        </div>
      </section>
    </main>
  );
}

function Register({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', countryCode: '966', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.email.trim()) {
      setError('البريد الإلكتروني مطلوب');
      return;
    }
    const localPhone = form.phone.replace(/\D/g, '');
    if (localPhone) {
      if (form.countryCode === '966' && !/^5\d{8}$/.test(localPhone)) {
        setError('رقم الجوال السعودي يجب أن يتكون من 9 أرقام ويبدأ بـ 5');
        return;
      }
      if (localPhone.length < 6 || localPhone.length > 14) {
        setError('رقم الجوال غير صحيح');
        return;
      }
    }
    if (form.password !== form.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      const phone = localPhone ? `+${form.countryCode}${localPhone}` : '';
      const result = await apiFetch<{ user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone,
          email: form.email.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
        }),
      });
      onLogin(result.user);
      navigate('/customer/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب العميل. تحقق من البيانات.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card register-card">
        <Link className="portal-back" to="/customer">← العودة إلى بوابة العملاء والمتجر</Link>
        <div className="brand-mark small">N</div>
        <div className="brand-block">
          <span className="eyebrow">CUSTOMER PORTAL</span>
          <h1>إنشاء حساب عميل</h1>
          <p>التسجيل العام متاح للعملاء فقط. حسابات الإدارة والموظفين ينشئها النظام من داخل بوابة العمل.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="form-row">
            <label>الاسم الأول<input value={form.firstName} onChange={e => update('firstName', e.target.value)} required /></label>
            <label>اسم العائلة<input value={form.lastName} onChange={e => update('lastName', e.target.value)} required /></label>
          </div>
          <label>البريد الإلكتروني <span>(مطلوب)</span><input type="email" dir="ltr" value={form.email} onChange={e => update('email', e.target.value)} autoComplete="email" required /></label>
          <label>
            رقم الجوال <span>(اختياري)</span>
            <div className="phone-field" dir="ltr">
              <select aria-label="رمز الدولة" value={form.countryCode} onChange={e => update('countryCode', e.target.value)}>
                {countryCodes.map(([code, name]) => <option key={code} value={code}>+{code} — {name}</option>)}
              </select>
              <input type="tel" inputMode="numeric" value={form.phone} onChange={e => update('phone', e.target.value)} autoComplete="tel-national" placeholder={form.countryCode === '966' ? '5XXXXXXXX' : 'رقم الجوال'} />
            </div>
            <small>اختر رمز الدولة ثم اكتب الرقم بدون رمز الدولة. السعودية هي الاختيار الافتراضي.</small>
          </label>
          <label>كلمة المرور<input type="password" value={form.password} onChange={e => update('password', e.target.value)} autoComplete="new-password" minLength={10} required /><small>10 أحرف على الأقل</small></label>
          <label>تأكيد كلمة المرور<input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} autoComplete="new-password" minLength={10} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-action button" type="submit" disabled={loading}>{loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء حساب العميل'}</button>
        </form>
        <div className="auth-switch">لديك حساب؟ <Link className="text-link" to="/customer/login">دخول العملاء</Link></div>
      </section>
    </main>
  );
}

function StaffDashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const staffType = user.staffType ?? 'employee';
  const isAdmin = staffType === 'admin';
  const can = (permission: string) => isAdmin || (user.permissions ?? []).includes(permission);
  const canCustomers = can('customers.read');
  const canPos = can('pos.read');
  const canOperations = can('catalog.read') || can('inventory.read') || can('orders.read');

  const navigate = useNavigate();
  async function logout() {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
      navigate('/admin', { replace: true });
    }
  }

  const modules = [
    ...(isAdmin ? [['الإدارة', 'ADMIN', 'إعدادات المركز وإدارة التشغيل والصلاحيات.', '']] : []),
    ...(can('staff.manage') ? [['الموظفون والأطباء والأخصائيون', 'STAFF', 'إدارة حسابات الطاقم الداخلي والصلاحيات.', '/admin/staff']] : []),
    ...(canCustomers ? [['العملاء', 'CUSTOMERS', 'ملفات العملاء والمتابعة والبيانات الأساسية.', '/admin/customers']] : []),
    ...(can('appointments.read') ? [['المواعيد', 'APPOINTMENTS', 'حجوزات المركز ومواعيد الأطباء والأخصائيين.', '/admin/appointments']] : []),
    ...(canCustomers ? [['متابعة العملاء', 'FOLLOW-UP', 'سجل الزيارات والمتابعات الدورية والتوصيات لكل عميل.', '/admin/follow-ups']] : []),
    ...(canPos ? [['نقطة البيع', 'POS', 'المبيعات والفواتير والمرتجعات.', '/admin/pos']] : []),
    ...(canOperations ? [['المخزون والمنتجات والطلبات', 'OPERATIONS', 'المنتجات والأرصدة وحركات المخزون وطلبات المتجر.', '/admin/operations']] : []),
    ...(can('nutrition.read') ? [['الخطط الغذائية', 'NUTRITION', 'إعداد ومتابعة الخطط الغذائية.', '/admin/nutrition']] : []),
    ...(can('fitness.read') ? [['الخطط الرياضية', 'FITNESS', 'إعداد ومتابعة خطط اللياقة.', '/admin/fitness']] : []),
    ...(can('reports.read') ? [['التقارير', 'REPORTS', 'تقارير التشغيل والمبيعات والمخزون.', '/admin/reports']] : []),
    ...(can('zatca.manage') ? [['الضرائب والفوترة الإلكترونية', 'ZATCA', 'إعداد الضرائب ومتابعة الفواتير الإلكترونية المتوافقة مع مسار فاتورة.', '/admin/zatca']] : []),
  ] as const;

  return (
    <main className="app-shell staff-workspace">
      <header className="app-header">
        <div className="brand-inline">
          <div className="brand-mark">N</div>
          <div><span className="eyebrow">INTERNAL WORKSPACE</span><h1>بوابة الإدارة والموظفين</h1></div>
        </div>
        <button className="secondary-button" onClick={logout}>تسجيل الخروج</button>
      </header>
      <section className="dashboard-intro">
        <p className="eyebrow">الإدارة والتشغيل الداخلي</p>
        <h2>مساحة عمل الإدارة والطاقم</h2>
        <p>هذه البوابة منفصلة عن بوابة العملاء والمتجر. تظهر هنا وظائف التشغيل الداخلية فقط.</p>
      </section>
      <section className="workspace-grid" aria-label="وحدات بوابة الإدارة والموظفين">
        {modules.map(([title, code, description, path]) => (
          <article className="workspace-card" key={code}>
            <span className="module-code">{code}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            {path ? <Link className="module-link" to={path}>فتح الوحدة ←</Link> : <span className="module-status">قيد البناء</span>}
          </article>
        ))}
      </section>
      <footer className="app-footer"><span>بوابة الإدارة والموظفين</span><span>{user.email ?? user.phone ?? 'حساب موظف'}</span></footer>
    </main>
  );
}

function Home() {
  return (
    <main className="portal-home">
      <section className="portal-home-inner">
        <div className="portal-home-heading">
          <span className="eyebrow">NUTRITION & FITNESS CENTER</span>
          <h1>اختر البوابة التي تريد الدخول إليها</h1>
          <p>تم فصل تجربة العملاء والمتجر عن بيئة الإدارة والموظفين والمخزون ونقطة البيع.</p>
        </div>
        <div className="portal-choice-grid">
          <article className="portal-choice customer-choice">
            <span className="eyebrow">CUSTOMER PORTAL</span>
            <h2>بوابة العملاء والمتجر</h2>
            <p>للعملاء فقط: الحساب الشخصي، القياسات، الخطط، المواعيد، المشتريات والمتجر الإلكتروني.</p>
            <div className="portal-choice-actions">
              <Link className="primary-action" to="/customer">دخول العملاء والمتجر</Link>
              <Link className="secondary-button" to="/customer/register">تسجيل عميل جديد</Link>
            </div>
            <span className="portal-url">/customer</span>
          </article>
          <article className="portal-choice staff-choice">
            <span className="eyebrow">STAFF & MANAGEMENT PORTAL</span>
            <h2>بوابة الإدارة والموظفين</h2>
            <p>للإدارة والأطباء والأخصائيين والموظفين: العملاء، المواعيد، المخزون، نقطة البيع والتشغيل الداخلي.</p>
            <div className="portal-choice-actions">
              <Link className="primary-action" to="/admin">دخول بوابة الإدارة</Link>
            </div>
            <span className="portal-url">/admin</span>
          </article>
        </div>
      </section>
    </main>
  );
}

function CustomerStore() {
  type Product = { id: string; sku: string; name: string; sellingPrice: string; taxCode?: string | null };
  type CartItem = { id: string; productId: string; quantity: string; unitPrice: string; name: string; sku: string };
  type OrderItem = { id: string; productId: string; productName: string; sku: string; quantity: string; unitPrice: string; lineTotal: string };
  type Order = {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: string;
    tax: string;
    total: string;
    paymentMethod?: string | null;
    paymentStatus: string;
    createdAt: string;
    items: OrderItem[];
  };

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{ id: string; items: CartItem[]; subtotal: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'bank_transfer'>('cash_on_delivery');
  const [loading, setLoading] = useState(true);
  const [busyProduct, setBusyProduct] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [productResult, cartResult, orderResult] = await Promise.all([
        apiFetch<{ products: Product[] }>('/customer-portal/store/products'),
        apiFetch<{ cart: { id: string; items: CartItem[]; subtotal: string } }>('/store/cart'),
        apiFetch<{ orders: Order[] }>('/store/orders'),
      ]);
      setProducts(productResult.products);
      setCart(cartResult.cart);
      setOrders(orderResult.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل المتجر');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addToCart(product: Product) {
    setBusyProduct(product.id);
    setMessage('');
    setError('');
    try {
      await apiFetch('/store/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      setMessage(`تمت إضافة «${product.name}» إلى السلة.`);
      const result = await apiFetch<{ cart: { id: string; items: CartItem[]; subtotal: string } }>('/store/cart');
      setCart(result.cart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة المنتج');
    } finally {
      setBusyProduct('');
    }
  }

  async function updateCartItem(item: CartItem, quantity: number) {
    if (quantity < 1) {
      await removeCartItem(item.id);
      return;
    }
    setError('');
    try {
      await apiFetch(`/store/cart/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      const result = await apiFetch<{ cart: { id: string; items: CartItem[]; subtotal: string } }>('/store/cart');
      setCart(result.cart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث السلة');
    }
  }

  async function removeCartItem(id: string) {
    setError('');
    try {
      await apiFetch(`/store/cart/items/${id}`, { method: 'DELETE' });
      const result = await apiFetch<{ cart: { id: string; items: CartItem[]; subtotal: string } }>('/store/cart');
      setCart(result.cart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المنتج');
    }
  }

  async function checkout() {
    if (!cart?.items.length) {
      setError('السلة فارغة');
      return;
    }
    setCheckoutLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await apiFetch<{ order: Order }>('/store/checkout', {
        method: 'POST',
        body: JSON.stringify({ paymentMethod }),
      });
      setMessage(
        paymentMethod === 'bank_transfer'
          ? `تم إنشاء الطلب ${result.order.orderNumber}. حالة الدفع غير مدفوعة وسيتم تأكيده بعد التحقق من التحويل.`
          : `تم إنشاء الطلب ${result.order.orderNumber}. الدفع عند الاستلام وسيتم تأكيد الطلب من المركز.`
      );
      const [cartResult, orderResult] = await Promise.all([
        apiFetch<{ cart: { id: string; items: CartItem[]; subtotal: string } }>('/store/cart'),
        apiFetch<{ orders: Order[] }>('/store/orders'),
      ]);
      setCart(cartResult.cart);
      setOrders(orderResult.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إتمام الطلب');
    } finally {
      setCheckoutLoading(false);
    }
  }

  const statusLabel: Record<string, string> = {
    pending: 'بانتظار التأكيد',
    confirmed: 'مؤكد',
    completed: 'مكتمل',
    cancelled: 'ملغى',
  };

  return (
    <main className="app-shell customer-store-page">
      <header className="app-header">
        <div>
          <span className="eyebrow">CUSTOMER STORE</span>
          <h1>المتجر الإلكتروني</h1>
        </div>
        <Link className="secondary-button" to="/customer/home">بوابة العميل</Link>
      </header>

      <section className="store-heading">
        <p className="eyebrow">منتجات المركز</p>
        <h2>المتجر الإلكتروني</h2>
        <p>كتالوج المنتجات الفعلي، سلة التسوق، والطلبات الخاصة بحسابك.</p>
      </section>

      {loading && <div className="info-strip">جارٍ تحميل المتجر...</div>}
      {error && <div className="info-strip warning">{error}</div>}
      {message && <div className="info-strip">{message}</div>}

      {!loading && !error && !products.length && (
        <section className="store-empty">
          <h2>لا توجد منتجات منشورة حاليًا</h2>
          <p>سيظهر هنا كتالوج المنتجات بعد أن تضيف الإدارة المنتجات وتفعلها.</p>
        </section>
      )}

      {!!products.length && (
        <section className="store-product-grid" aria-label="منتجات المتجر">
          {products.map(product => (
            <article className="store-product-card" key={product.id}>
              <span className="module-code">{product.sku}</span>
              <h3>{product.name}</h3>
              <strong>{product.sellingPrice} ر.س</strong>
              <button className="primary-action button" type="button" onClick={() => void addToCart(product)} disabled={busyProduct === product.id}>
                {busyProduct === product.id ? 'جارٍ الإضافة...' : 'إضافة للسلة'}
              </button>
            </article>
          ))}
        </section>
      )}

      {cart && (
        <section className="store-cart">
          <div className="panel-heading-row">
            <div><span className="eyebrow">CART</span><h2>سلة التسوق</h2></div>
            <strong>{cart.subtotal} ر.س</strong>
          </div>
          {!cart.items.length ? (
            <p className="empty-state">السلة فارغة. أضف المنتجات التي تريدها.</p>
          ) : (
            <>
              <div className="cart-list">
                {cart.items.map(item => (
                  <div className="cart-row" key={item.id}>
                    <div><strong>{item.name}</strong><small>{item.sku} · {item.unitPrice} ر.س</small></div>
                    <div className="cart-controls">
                      <button type="button" onClick={() => void updateCartItem(item, Number(item.quantity) - 1)} aria-label={`تقليل ${item.name}`}>−</button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => void updateCartItem(item, Number(item.quantity) + 1)} aria-label={`زيادة ${item.name}`}>+</button>
                      <button type="button" className="cart-remove" onClick={() => void removeCartItem(item.id)}>حذف</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="checkout-panel">
                <div>
                  <span className="eyebrow">CHECKOUT</span>
                  <h3>إتمام الطلب</h3>
                </div>
                <label>
                  طريقة الدفع
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                    <option value="cash_on_delivery">الدفع عند الاستلام</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                  </select>
                </label>
                <button className="primary-action button" type="button" onClick={() => void checkout()} disabled={checkoutLoading}>
                  {checkoutLoading ? 'جارٍ إنشاء الطلب...' : `تأكيد الطلب — ${cart.subtotal} ر.س`}
                </button>
                <div className="cart-note">الدفع الإلكتروني عبر مدى وApple Pay والبطاقات غير مفعّل حتى يتم ربط بوابة دفع حقيقية. لا يتم إنشاء عملية دفع وهمية.</div>
              </div>
            </>
          )}
        </section>
      )}

      <section className="store-cart">
        <div className="panel-heading-row">
          <div><span className="eyebrow">ORDERS</span><h2>طلباتي</h2></div>
        </div>
        {!orders.length ? (
          <p className="empty-state">لا توجد طلبات متجر حتى الآن.</p>
        ) : (
          <div className="cart-list">
            {orders.map(order => (
              <article className="cart-row" key={order.id}>
                <div>
                  <strong>{order.orderNumber}</strong>
                  <small>{new Date(order.createdAt).toLocaleString('ar-SA')} · {statusLabel[order.status] ?? order.status}</small>
                  <small>{order.items.length} منتج · {order.total} ر.س · {order.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}</small>
                </div>
                <strong>{order.total} ر.س</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
function StaffPOS({ user }: { user: AuthUser }) {
  const isAdmin = user.staffType === 'admin';
  const can = (permission: string) => isAdmin || (user.permissions ?? []).includes(permission);
  const canSell = can('pos.sell');
  const canVoid = can('pos.void');
  const canZatca = can('zatca.manage');
  type Product = { id:string; sku:string; name:string; sellingPrice:string; purchaseCost:string; barcode?:string|null; quantity:string };
  type Customer = { id:string; customerNumber:string; firstName:string; lastName:string; phone?:string|null };
  type CartItem = Product & { cartQuantity:number; price:number; discount:number };
  type Sale = { id:string; saleNumber:string; status:string; subtotal:string; discount:string; tax:string; total:string; paymentMethod:string; createdAt:string; customerName?:string|null };
  type SaleDetail = Sale & { items:{id:string; productId:string; productName:string; sku:string; quantity:string; unitPrice:string; discount:string; tax:string; lineTotal:string}[] };

  const [query,setQuery]=useState(''); const [products,setProducts]=useState<Product[]>([]);
  const [cart,setCart]=useState<CartItem[]>([]); const [customerQuery,setCustomerQuery]=useState(''); const [customers,setCustomers]=useState<Customer[]>([]);
  const [customer,setCustomer]=useState<Customer|null>(null); const [paymentMethod,setPaymentMethod]=useState<'cash'|'mada'|'card'|'bank_transfer'>('cash');
  const [loading,setLoading]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const [salesHistory,setSalesHistory]=useState<Sale[]>([]); const [selectedSale,setSelectedSale]=useState<SaleDetail|null>(null); const [historyLoading,setHistoryLoading]=useState(false);

  async function searchProducts(value:string) { setQuery(value); setError(''); if(!value.trim()){setProducts([]);return;} try { const r=await apiFetch<{products:Product[]}>('/staff/pos/products?q='+encodeURIComponent(value.trim())); setProducts(r.products); } catch(e){setError(e instanceof Error?e.message:'تعذر البحث عن المنتج');} }
  function addProduct(p:Product) { if(Number(p.quantity)<=0){setError('المنتج غير متوفر في المخزون');return;} setCart(v=>{const x=v.find(i=>i.id===p.id); return x?v.map(i=>i.id===p.id?{...i,cartQuantity:Math.min(Number(p.quantity),i.cartQuantity+1)}:i):[...v,{...p,cartQuantity:1,price:Number(p.sellingPrice),discount:0}];}); setQuery('');setProducts([]);setError(''); }
  async function searchCustomers(value:string) { setCustomerQuery(value); if(!value.trim()){setCustomers([]);return;} try { const r=await apiFetch<{customers:Customer[]}>('/staff/pos/customers?q='+encodeURIComponent(value.trim()));setCustomers(r.customers); } catch(e){setError(e instanceof Error?e.message:'تعذر البحث عن العميل');} }
  async function loadSalesHistory(){ setHistoryLoading(true); try { const r=await apiFetch<{sales:Sale[]}>('/staff/pos/sales'); setSalesHistory(r.sales); } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل المبيعات');} finally{setHistoryLoading(false);} }
  async function openSale(id:string){ try { const r=await apiFetch<{sale:SaleDetail}>('/staff/pos/sales/'+id); setSelectedSale(r.sale); } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل تفاصيل البيع');} }
  async function voidSale(id:string){ if(!window.confirm('سيتم إلغاء عملية البيع وعكس كميات المخزون. هل تريد المتابعة؟')) return; try { await apiFetch('/staff/pos/sales/'+id+'/void',{method:'POST',body:JSON.stringify({})}); setMessage('تم إلغاء عملية البيع وعكس المخزون.'); await loadSalesHistory(); await openSale(id); } catch(e){setError(e instanceof Error?e.message:'تعذر إلغاء عملية البيع');} }
  async function prepareZatcaInvoice(id:string){ setError(''); setMessage(''); try { const r=await apiFetch<{invoice:{invoiceNumber:string;status:string}}>('/zatca/sales/'+id+'/prepare',{method:'POST',body:JSON.stringify({invoiceType:'simplified'})}); setMessage('تم تجهيز الفاتورة الإلكترونية '+r.invoice.invoiceNumber+' بصيغة ZATCA. التوقيع والإرسال إلى FATOORA ما زالا يحتاجان CSID.'); } catch(e){setError(e instanceof Error?e.message:'تعذر تجهيز الفاتورة الإلكترونية');} }
  const subtotal=cart.reduce((s,x)=>s+x.cartQuantity*x.price,0); const discount=cart.reduce((s,x)=>s+x.discount,0); const total=Math.max(0,subtotal-discount);
  async function completeSale(){ if(!cart.length){setError('السلة فارغة');return;} setLoading(true);setError('');setMessage(''); try { const r=await apiFetch<{sale:{id:string;saleNumber:string;total:string}}>('/staff/pos/sales',{method:'POST',body:JSON.stringify({customerId:customer?.id??null,paymentMethod,items:cart.map(x=>({productId:x.id,quantity:x.cartQuantity,unitPrice:x.price,discount:x.discount}))})}); setMessage('تم تسجيل البيع '+r.sale.saleNumber+' بإجمالي '+r.sale.total+' ر.س');setCart([]);setCustomer(null);setCustomerQuery(''); await loadSalesHistory(); await openSale(r.sale.id); } catch(e){setError(e instanceof Error?e.message:'تعذر إتمام البيع');} finally{setLoading(false);} }

  return <main className="app-shell"><header className="app-header"><div><span className="eyebrow">POINT OF SALE</span><h1>نقطة البيع</h1></div><div className="portal-choice-actions"><button className="secondary-button" type="button" onClick={()=>void loadSalesHistory()}>المبيعات السابقة</button><Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link></div></header>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}
    <section className="staff-management-grid"><section className="panel"><p className="eyebrow">PRODUCT SEARCH</p><h2>إضافة المنتجات</h2>
      <input autoFocus dir="ltr" value={query} onChange={e=>void searchProducts(e.target.value)} placeholder="SKU أو باركود أو اسم المنتج" />
      {!!products.length&&<div className="cart-list">{products.map(p=><button type="button" className="cart-row" key={p.id} onClick={()=>addProduct(p)}><span><strong>{p.name}</strong><small>{p.sku}{p.barcode?' · '+p.barcode:''} · المتاح {p.quantity}</small></span><strong>{p.sellingPrice} ر.س</strong></button>)}</div>}
      <div className="panel-heading-row"><div><p className="eyebrow">CUSTOMER</p><h3>{customer?customer.firstName+' '+customer.lastName:'عميل اختياري'}</h3></div></div>
      <input value={customerQuery} onChange={e=>void searchCustomers(e.target.value)} placeholder="بحث بالرقم أو الجوال أو الاسم" />
      {!!customers.length&&!customer&&<div className="cart-list">{customers.map(c=><button type="button" className="cart-row" key={c.id} onClick={()=>{setCustomer(c);setCustomers([]);setCustomerQuery(c.customerNumber);}}><span><strong>{c.firstName} {c.lastName}</strong><small>{c.customerNumber} · {c.phone??'بدون جوال'}</small></span></button>)}</div>}
      {customer&&<button className="secondary-button" type="button" onClick={()=>{setCustomer(null);setCustomerQuery('');}}>إزالة العميل</button>}</section>
    <section className="panel"><p className="eyebrow">CURRENT SALE</p><h2>السلة</h2>
      {!cart.length ? <p className="empty-state">لم تتم إضافة منتجات.</p> : <div className="cart-list">
        {cart.map(item => <div className="cart-row" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.price.toFixed(2)} ر.س · الكمية {item.cartQuantity}</small></div>
          <div className="cart-controls">
            <button type="button" onClick={() => setCart(v => v.map(x => x.id === item.id ? {...x, cartQuantity: Math.max(1, x.cartQuantity - 1)} : x))}>−</button>
            <span>{item.cartQuantity}</span>
            <button type="button" onClick={() => setCart(v => v.map(x => x.id === item.id ? {...x, cartQuantity: Math.min(Number(x.quantity), x.cartQuantity + 1)} : x))}>+</button>
            <button type="button" className="cart-remove" onClick={() => setCart(v => v.filter(x => x.id !== item.id))}>حذف</button>
          </div>
        </div>)}
      </div>}
      <div className="checkout-panel"><div><span className="eyebrow">PAYMENT</span><h3>الإجمالي: {total.toFixed(2)} ر.س</h3><small>قبل الضريبة — محرك الضريبة لم يتم ربطه بعد.</small></div>
        <label>طريقة الدفع<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="cash">نقدي</option><option value="mada">مدى</option><option value="card">بطاقة</option><option value="bank_transfer">تحويل بنكي</option></select></label>
        {canSell && <button className="primary-action button" type="button" onClick={()=>void completeSale()} disabled={loading||!cart.length}>{loading?'جارٍ تسجيل البيع...':'إتمام البيع'}</button>}<div className="cart-note">البيع يُسجل ذريًا في المبيعات وعناصر البيع وحركة المخزون. لا يتم إنشاء قيد دفع إلكتروني وهمي.</div></div></section></section>

    <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">SALES HISTORY</p><h2>آخر المبيعات</h2></div><button className="secondary-button" type="button" onClick={()=>void loadSalesHistory()} disabled={historyLoading}>{historyLoading?'جارٍ التحميل...':'تحديث'}</button></div>
      {!salesHistory.length ? <p className="empty-state">اضغط «المبيعات السابقة» لعرض آخر 100 عملية بيع.</p> :
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>رقم البيع</th><th>العميل</th><th>الإجمالي</th><th>الدفع</th><th>التاريخ</th><th></th></tr></thead><tbody>
        {salesHistory.map(s=><tr key={s.id}><td>{s.saleNumber}</td><td>{s.customerName??'عميل نقدي'}</td><td>{s.total} ر.س</td><td>{s.paymentMethod}</td><td>{new Date(s.createdAt).toLocaleString('ar-SA')}</td><td><button className="secondary-button" type="button" onClick={()=>void openSale(s.id)}>التفاصيل</button></td></tr>)}
      </tbody></table></div>}
    </section>

    {selectedSale&&<section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">SALE RECEIPT</p><h2>{selectedSale.saleNumber}</h2></div><button className="secondary-button" type="button" onClick={()=>window.print()}>طباعة</button></div>
      <p>{selectedSale.customerName??'عميل نقدي'} · {new Date(selectedSale.createdAt).toLocaleString('ar-SA')} · الحالة: {selectedSale.status}</p>
      {selectedSale.status === 'completed' && canZatca && <button className="secondary-button" type="button" onClick={()=>void prepareZatcaInvoice(selectedSale.id)}>تجهيز فاتورة ZATCA</button>}{selectedSale.status === 'completed' && canVoid && <button className="secondary-button" type="button" onClick={()=>void voidSale(selectedSale.id)}>إلغاء عملية البيع وعكس المخزون</button>}
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>المنتج</th><th>SKU</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>{selectedSale.items.map(i=><tr key={i.id}><td>{i.productName}</td><td>{i.sku}</td><td>{i.quantity}</td><td>{i.unitPrice} ر.س</td><td>{i.lineTotal} ر.س</td></tr>)}</tbody></table></div>
      <div className="checkout-panel"><strong>الإجمالي: {selectedSale.total} ر.س</strong><small>الضريبة المسجلة حاليًا: {selectedSale.tax} ر.س</small></div>
    </section>}
  </main>;
}
function StaffOperations({ user }: { user: AuthUser }) {
  const staffType = user.staffType ?? 'employee';
  const isAdmin = staffType === 'admin';
  const can = (permission: string) => isAdmin || (user.permissions ?? []).includes(permission);
  const canManageCatalog = can('catalog.read');
  const canManageInventory = can('inventory.read');
  const canAdjustInventory = can('inventory.adjust');
  const canWriteCatalog = can('catalog.write');
  const canManageOrders = can('orders.read');
  const canUpdateOrders = can('orders.update');
  type Product = { id: string; sku: string; name: string; purchaseCost: string; sellingPrice: string; reorderPoint: string; active: boolean; categoryName?: string | null; brandName?: string | null };
  type Inventory = { productId: string; sku: string; name: string; quantity: string; reorderPoint: string; purchaseCost: string; sellingPrice: string; lowStock: boolean };
  type Movement = { id: string; movementType: string; quantity: string; unitCost: string; referenceType?: string | null; referenceId?: string | null; occurredAt: string; notes?: string | null };
  type Order = { id: string; orderNumber: string; customerId: string; status: string; total: string; paymentMethod?: string | null; paymentStatus: string; createdAt: string };

  const [tab, setTab] = useState<'products'|'inventory'|'orders'>(canManageOrders && !canManageCatalog && !canManageInventory ? 'orders' : canManageCatalog ? 'products' : 'inventory');
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<{id:string;name:string}[]>([]);
  const [brands, setBrands] = useState<{id:string;name:string}[]>([]);
  const [form, setForm] = useState({sku:'',name:'',categoryId:'',brandId:'',purchaseCost:'0',sellingPrice:'0',taxCode:'',reorderPoint:'0'});
  const [adjust, setAdjust] = useState({productId:'',quantity:'',movementType:'opening',unitCost:'',notes:''});
  const [receipt, setReceipt] = useState({reference:'',notes:''});
  const [receiptItems, setReceiptItems] = useState<{productId:string;quantity:string;unitCost:string}[]>([]);
  const [movementProduct, setMovementProduct] = useState<Inventory | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementLoading, setMovementLoading] = useState(false);
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);

  async function load() {
    try {
      if (canManageCatalog || canManageInventory) {
        const [p,i,opt] = await Promise.all([
          canManageCatalog ? apiFetch<{products:Product[]}>('/staff/products') : Promise.resolve({products: [] as Product[]}),
          canManageInventory ? apiFetch<{inventory:Inventory[]}>('/staff/inventory') : Promise.resolve({inventory: [] as Inventory[]}),
          canManageCatalog ? apiFetch<{categories:{id:string;name:string}[];brands:{id:string;name:string}[]}>('/staff/catalog-options') : Promise.resolve({categories: [], brands: []}),
        ]);
        setProducts(p.products); setInventory(i.inventory); setCategories(opt.categories); setBrands(opt.brands);
        if (!form.categoryId && opt.categories[0]) setForm(v=>({...v,categoryId:opt.categories[0].id}));
        if (!adjust.productId && i.inventory[0]) setAdjust(v=>({...v,productId:i.inventory[0].productId}));
      }
      if (canManageOrders) {
        const o = await apiFetch<{orders:Order[]}>('/staff/orders');
        setOrders(o.orders);
      }
    } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل بيانات التشغيل');}
  }
  useEffect(()=>{void load()},[]);

  async function createProduct(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      await apiFetch('/staff/products',{method:'POST',body:JSON.stringify({...form,brandId:form.brandId||null,purchaseCost:Number(form.purchaseCost),sellingPrice:Number(form.sellingPrice),reorderPoint:Number(form.reorderPoint),active:true})});
      setForm(v=>({...v,sku:'',name:'',purchaseCost:'0',sellingPrice:'0',taxCode:'',reorderPoint:'0'}));
      setMessage('تم إنشاء المنتج'); await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء المنتج');} finally{setSaving(false);}
  }

  function addReceiptItem() {
    const productId = inventory[0]?.productId ?? '';
    if (!productId) return;
    setReceiptItems(items => [...items, { productId, quantity: '', unitCost: '' }]);
  }

  async function receivePurchase(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    const items = receiptItems.filter(item => item.productId && Number(item.quantity) > 0).map(item => ({
      productId: item.productId, quantity: Number(item.quantity), unitCost: item.unitCost ? Number(item.unitCost) : undefined,
    }));
    if (!items.length) { setError('أضف منتجًا واحدًا على الأقل إلى الاستلام.'); setSaving(false); return; }
    try {
      const result = await apiFetch<{receivedLines:number}>('/staff/inventory/receipt', {
        method:'POST',
        body:JSON.stringify({ reference: receipt.reference || undefined, notes: receipt.notes || undefined, items }),
      });
      setReceipt({reference:'',notes:''}); setReceiptItems([]);
      setMessage(`تم استلام ${result.receivedLines} صنف وتحديث المخزون بالكامل.`);
      await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل استلام الشراء');}
    finally{setSaving(false);}
  }

  async function adjustStock(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const result = await apiFetch<{currentStock:string|number}>('/staff/inventory/adjust',{method:'POST',body:JSON.stringify({
        productId:adjust.productId, quantity:Number(adjust.quantity), movementType:adjust.movementType,
        unitCost:adjust.unitCost ? Number(adjust.unitCost) : undefined, notes:adjust.notes
      })});
      setAdjust(v=>({...v,quantity:'',unitCost:'',notes:''}));
      setMessage(`تم تسجيل الحركة. الرصيد الحالي: ${Number(result.currentStock).toFixed(3)}`);
      await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل الحركة');} finally{setSaving(false);}
  }

  async function openMovements(item: Inventory) {
    setMovementProduct(item); setMovementLoading(true); setError('');
    try {
      const result = await apiFetch<{movements:Movement[]}>(`/staff/inventory/${item.productId}/movements`);
      setMovements(result.movements);
    } catch(e){setError(e instanceof Error?e.message:'تعذر تحميل حركات المخزون'); setMovementProduct(null);}
    finally{setMovementLoading(false);}
  }

  async function setOrderStatus(id:string,status:'confirmed'|'completed'|'cancelled') {
    try { await apiFetch(`/staff/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); setMessage('تم تحديث حالة الطلب'); await load(); }
    catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الطلب');}
  }

  const movementLabels: Record<string,string> = {
    opening:'رصيد افتتاحي', purchase:'شراء', adjustment_in:'تسوية إضافة', adjustment_out:'تسوية صرف',
    return_in:'مرتجع وارد', return_out:'مرتجع صادر', sale:'بيع'
  };

  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">OPERATIONS</span><h1>المنتجات والمخزون والطلبات</h1></div><Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link></header>
    <div className="portal-choice-actions">
      {canManageCatalog && <button className={`secondary-button ${tab==='products'?'active':''}`} onClick={()=>setTab('products')}>المنتجات</button>}
      {canManageInventory && <button className={`secondary-button ${tab==='inventory'?'active':''}`} onClick={()=>setTab('inventory')}>المخزون</button>}
      {canManageOrders && <button className={`secondary-button ${tab==='orders'?'active':''}`} onClick={()=>setTab('orders')}>طلبات المتجر</button>}
    </div>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}

    {canManageCatalog && tab==='products'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">PRODUCT MASTER</p><h2>إضافة منتج</h2><form className="form-stack" onSubmit={createProduct}>
        <label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
        <label>اسم المنتج<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>التصنيف<select required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>العلامة التجارية<select value={form.brandId} onChange={e=>setForm({...form,brandId:e.target.value})}><option value="">بدون علامة</option>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>تكلفة الشراء<input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={e=>setForm({...form,purchaseCost:e.target.value})}/></label>
        <label>سعر البيع<input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/></label>
        <label>رمز الضريبة<input value={form.taxCode} onChange={e=>setForm({...form,taxCode:e.target.value})} placeholder="اتركه فارغًا حتى إعداد محرك الضريبة"/></label>
        <label>حد إعادة الطلب<input type="number" min="0" step="0.001" value={form.reorderPoint} onChange={e=>setForm({...form,reorderPoint:e.target.value})}/></label>
        {canWriteCatalog && <button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'حفظ المنتج'}</button>}
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">CATALOG</p><h2>المنتجات</h2></div></div><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>التصنيف</th><th>التكلفة</th><th>البيع</th><th>الحالة</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{p.categoryName??'—'}</td><td>{p.purchaseCost}</td><td>{p.sellingPrice}</td><td>{p.active?'نشط':'موقوف'}</td></tr>)}</tbody></table></div></section>
    </section>}

    {canManageInventory && tab==='inventory'&&<section className="staff-management-grid">
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">PURCHASE RECEIPT</p><h2>استلام شراء</h2><small>استلام عدة منتجات في عملية واحدة وبشكل ذري.</small></div></div>
        <form className="form-stack" onSubmit={receivePurchase}>
          <label>رقم الفاتورة / المرجع<input value={receipt.reference} onChange={e=>setReceipt({...receipt,reference:e.target.value})} placeholder="اختياري"/></label>
          {receiptItems.map((item,index)=><div className="form-row" key={index}>
            <label>المنتج<select required value={item.productId} onChange={e=>setReceiptItems(items=>items.map((x,i)=>i===index?{...x,productId:e.target.value}:x))}>{inventory.map(p=><option key={p.productId} value={p.productId}>{p.sku} — {p.name}</option>)}</select></label>
            <label>الكمية<input type="number" min="0.001" step="0.001" required value={item.quantity} onChange={e=>setReceiptItems(items=>items.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label>
            <label>تكلفة الوحدة<input type="number" min="0" step="0.01" value={item.unitCost} onChange={e=>setReceiptItems(items=>items.map((x,i)=>i===index?{...x,unitCost:e.target.value}:x))}/></label>
            <button className="secondary-button" type="button" onClick={()=>setReceiptItems(items=>items.filter((_,i)=>i!==index))}>حذف</button>
          </div>)}
          <button className="secondary-button" type="button" onClick={addReceiptItem}>إضافة صنف</button>
          <label>ملاحظات<textarea value={receipt.notes} onChange={e=>setReceipt({...receipt,notes:e.target.value})}/></label>
          <button className="primary-action button" disabled={saving || !receiptItems.length}>{saving?'جارٍ الحفظ...':'تسجيل استلام الشراء'}</button>
        </form>
      </section>

      <section className="panel"><p className="eyebrow">STOCK MOVEMENT</p><h2>إدارة حركة المخزون</h2><form className="form-stack" onSubmit={adjustStock}>
        <label>المنتج<select required value={adjust.productId} onChange={e=>setAdjust({...adjust,productId:e.target.value})}><option value="">اختر المنتج</option>{inventory.map(p=><option key={p.productId} value={p.productId}>{p.sku} — {p.name}</option>)}</select></label>
        <label>نوع الحركة<select value={adjust.movementType} onChange={e=>setAdjust({...adjust,movementType:e.target.value})}>
          <option value="opening">رصيد افتتاحي</option><option value="purchase">شراء</option><option value="adjustment_in">تسوية إضافة</option><option value="adjustment_out">تسوية صرف</option><option value="return_in">مرتجع وارد</option><option value="return_out">مرتجع صادر</option>
        </select></label>
        <label>الكمية<input type="number" min="0.001" step="0.001" required value={adjust.quantity} onChange={e=>setAdjust({...adjust,quantity:e.target.value})}/></label>
        <label>تكلفة الوحدة <small>اختياري</small><input type="number" min="0" step="0.01" value={adjust.unitCost} onChange={e=>setAdjust({...adjust,unitCost:e.target.value})}/></label>
        <label>ملاحظة<textarea value={adjust.notes} onChange={e=>setAdjust({...adjust,notes:e.target.value})}/></label>
        {canAdjustInventory && <button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'تسجيل حركة المخزون'}</button>}
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">STOCK CONTROL</p><h2>الأرصدة الحالية</h2></div><span className="module-status">{inventory.filter(x=>x.lowStock).length} تحت حد الطلب</span></div>
        <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>الرصيد</th><th>حد الطلب</th><th>قيمة التكلفة</th><th>الحالة</th><th></th></tr></thead><tbody>
        {inventory.map(x=><tr key={x.productId}><td>{x.sku}</td><td>{x.name}</td><td>{Number(x.quantity).toFixed(3)}</td><td>{Number(x.reorderPoint).toFixed(3)}</td><td>{(Number(x.quantity)*Number(x.purchaseCost)).toFixed(2)} ر.س</td><td>{x.lowStock?<span className="status-badge inactive">إعادة طلب</span>:<span className="status-badge active">متوفر</span>}</td><td><button className="secondary-button" type="button" onClick={()=>void openMovements(x)}>الحركات</button></td></tr>)}
        </tbody></table></div>
      </section>
    </section>}

    {movementProduct && <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">MOVEMENT HISTORY</p><h2>{movementProduct.name}</h2><small>{movementProduct.sku} · الرصيد الحالي {Number(movementProduct.quantity).toFixed(3)}</small></div><button className="secondary-button" type="button" onClick={()=>setMovementProduct(null)}>إغلاق</button></div>
      {movementLoading ? <p className="empty-state">جارٍ تحميل الحركات...</p> : !movements.length ? <p className="empty-state">لا توجد حركات مسجلة لهذا المنتج.</p> :
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الحركة</th><th>الكمية</th><th>تكلفة الوحدة</th><th>التاريخ</th><th>المرجع</th><th>الملاحظة</th></tr></thead><tbody>
      {movements.map(m=><tr key={m.id}><td>{movementLabels[m.movementType]??m.movementType}</td><td>{Number(m.quantity)>0?'+':''}{Number(m.quantity).toFixed(3)}</td><td>{Number(m.unitCost).toFixed(2)} ر.س</td><td>{new Date(m.occurredAt).toLocaleString('ar-SA')}</td><td>{m.referenceType??'—'}</td><td>{m.notes??'—'}</td></tr>)}
      </tbody></table></div>}
    </section>}

    {canManageOrders && tab==='orders'&&<section className="panel"><p className="eyebrow">CUSTOMER ORDERS</p><h2>طلبات العملاء</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الطلب</th><th>الحالة</th><th>الإجمالي</th><th>الدفع</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.orderNumber}</td><td>{o.status}</td><td>{o.total} ر.س</td><td>{o.paymentStatus}</td><td>{new Date(o.createdAt).toLocaleString('ar-SA')}</td><td>{canUpdateOrders && o.status==='pending'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'confirmed')}>تأكيد</button>}{canUpdateOrders && o.status==='confirmed'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'completed')}>إكمال</button>}{canUpdateOrders && o.status!=='completed'&&o.status!=='cancelled'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'cancelled')}>إلغاء</button>}</td></tr>)}</tbody></table></div></section>}
  </main>;
}

function Health() {
  return <main className="shell narrow"><section className="panel"><p className="eyebrow">System Health</p><h1>النظام يعمل</h1><p>واجهة التطبيق الأساسية تعمل. حالة قاعدة البيانات وخدمات الإنتاج تُفحص من طبقة الـ API.</p><Link className="text-link" to="/">العودة</Link></section></main>;
}

function NotFound() {
  return <main className="shell narrow"><section className="panel"><p className="eyebrow">404</p><h1>الصفحة غير موجودة</h1><Link className="text-link" to="/">العودة للبوابات</Link></section></main>;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    apiFetch<{ user: AuthUser }>('/auth/me')
      .then(r => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  if (authChecking) return <main className="loading-page"><div className="brand-mark">N</div><p>جارٍ تحميل النظام...</p></main>;

  const customerGuard = user?.role === 'customer';
  const staffGuard = user?.role === 'staff';
  const permissionGuard = (code: string) => staffGuard && (user?.staffType === 'admin' || (user?.permissions ?? []).includes(code));

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/health" element={<Health />} />

      <Route path="/customer" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <Login portal="customer" onLogin={setUser} />} />
      <Route path="/customer/login" element={<Navigate to="/customer" replace />} />
      <Route path="/customer/register" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <Register onLogin={setUser} />} />
      <Route path="/customer/forgot-password" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <ForgotPassword />} />
      <Route path="/customer/reset-password" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <ResetPassword />} />
      <Route path="/customer/home" element={customerGuard ? <CustomerPortal onLogout={async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } finally { setUser(null); } }} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/customer" replace />} />
      <Route path="/customer/store" element={customerGuard ? <CustomerStore /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/customer" replace />} />

      <Route path="/admin" element={user ? <Navigate to={user.role === 'staff' ? '/admin/dashboard' : '/customer/home'} replace /> : <Login portal="staff" onLogin={setUser} />} />
      <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/dashboard" element={staffGuard ? <StaffDashboard user={user} onLogout={async () => { try { await apiFetch('/auth/logout', { method: 'POST' }); } finally { setUser(null); } }} /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/staff" element={permissionGuard('staff.manage') ? <StaffManagement /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/pos" element={permissionGuard('pos.read') ? <StaffPOS user={user!} /> : staffGuard ? <Navigate to="/admin/dashboard" replace /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/appointments" element={permissionGuard('appointments.read') ? <Appointments user={user!} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/nutrition" element={permissionGuard('nutrition.read') ? <NutritionManagement user={user!} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/fitness" element={permissionGuard('fitness.read') ? <FitnessManagement user={user!} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/customers" element={permissionGuard('customers.read') ? <Customers user={user!} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/customers/:id" element={permissionGuard('customers.read') ? <Customer360 /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/measurements" element={permissionGuard('customers.read') ? <MeasurementsManagement /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/follow-ups" element={permissionGuard('customers.read') ? <FollowUpsManagement /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/operations" element={staffGuard && (user?.staffType === 'admin' || ['catalog.read','inventory.read','orders.read'].some(p => (user?.permissions ?? []).includes(p))) ? <StaffOperations user={user} /> : staffGuard ? <Navigate to="/admin/dashboard" replace /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/reports" element={permissionGuard('reports.read') ? <Reports user={user!} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/zatca" element={permissionGuard('zatca.manage') ? <ZatcaSettings /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />

      <Route path="/login" element={<Navigate to="/customer" replace />} />
      <Route path="/register" element={<Navigate to="/customer/register" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/customer/forgot-password" replace />} />
      <Route path="/reset-password" element={<Navigate to="/customer/reset-password" replace />} />

      <Route path="/customers" element={permissionGuard('customers.read') ? <Customers user={user!} /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
