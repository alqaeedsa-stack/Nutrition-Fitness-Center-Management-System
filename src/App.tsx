import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Customers from './Customers';
import CustomerPortal from './CustomerPortal';
import { ForgotPassword, ResetPassword } from './PasswordReset';
import { apiFetch } from './lib/api';
import StaffManagement from './StaffManagement';

type AuthUser = {
  id: string;
  centerId?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  role: 'customer' | 'staff';
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
          <label>
            كلمة المرور
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
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
    ['الإدارة', 'ADMIN', 'إعدادات المركز وإدارة التشغيل والصلاحيات.', ''],
    ['الموظفون والأطباء والأخصائيون', 'STAFF', 'إدارة حسابات الطاقم الداخلي والأدوار.', '/admin/staff'],
    ['العملاء', 'CUSTOMERS', 'ملفات العملاء والمتابعة والبيانات الأساسية.', '/customers'],
    ['المواعيد', 'APPOINTMENTS', 'حجوزات المركز ومواعيد الأطباء والأخصائيين.', ''],
    ['نقطة البيع', 'POS', 'المبيعات والفواتير والمرتجعات.', ''],
    ['المخزون والمنتجات والطلبات', 'OPERATIONS', 'المنتجات والأرصدة وحركات المخزون وطلبات المتجر.', '/admin/operations'],
    ['الخطط الغذائية', 'NUTRITION', 'إعداد ومتابعة الخطط الغذائية.', ''],
    ['الخطط الرياضية', 'FITNESS', 'إعداد ومتابعة خطط اللياقة.', ''],
    ['التقارير', 'REPORTS', 'تقارير التشغيل والمبيعات والمخزون.', ''],
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
function StaffOperations() {
  type Product = { id: string; sku: string; name: string; purchaseCost: string; sellingPrice: string; reorderPoint: string; active: boolean; categoryName?: string | null; brandName?: string | null };
  type Inventory = { productId: string; sku: string; name: string; quantity: string; reorderPoint: string; purchaseCost: string; sellingPrice: string };
  type Order = { id: string; orderNumber: string; customerId: string; status: string; total: string; paymentMethod?: string | null; paymentStatus: string; createdAt: string };

  const [tab, setTab] = useState<'products'|'inventory'|'orders'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<{id:string;name:string}[]>([]);
  const [brands, setBrands] = useState<{id:string;name:string}[]>([]);
  const [form, setForm] = useState({sku:'',name:'',categoryId:'',brandId:'',purchaseCost:'0',sellingPrice:'0',taxCode:'',reorderPoint:'0'});
  const [adjust, setAdjust] = useState({productId:'',quantity:'',notes:''});
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [saving,setSaving]=useState(false);

  async function load() {
    try {
      const [p,i,o,opt]=await Promise.all([
        apiFetch<{products:Product[]}>('/staff/products'),
        apiFetch<{inventory:Inventory[]}>('/staff/inventory'),
        apiFetch<{orders:Order[]}>('/staff/orders'),
        apiFetch<{categories:{id:string;name:string}[];brands:{id:string;name:string}[]}>('/staff/catalog-options')
      ]);
      setProducts(p.products); setInventory(i.inventory); setOrders(o.orders); setCategories(opt.categories); setBrands(opt.brands);
      if (!form.categoryId && opt.categories[0]) setForm(v=>({...v,categoryId:opt.categories[0].id}));
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

  async function adjustStock(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      await apiFetch('/staff/inventory/adjust',{method:'POST',body:JSON.stringify({productId:adjust.productId,quantity:Number(adjust.quantity),notes:adjust.notes})});
      setAdjust({productId:'',quantity:'',notes:''}); setMessage('تم تسجيل حركة المخزون'); await load();
    } catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل الحركة');} finally{setSaving(false);}
  }

  async function setOrderStatus(id:string,status:'confirmed'|'completed'|'cancelled') {
    try { await apiFetch(`/staff/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); setMessage('تم تحديث حالة الطلب'); await load(); }
    catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الطلب');}
  }

  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">OPERATIONS</span><h1>المنتجات والمخزون والطلبات</h1></div><Link className="secondary-button" to="/admin/dashboard">لوحة الإدارة</Link></header>
    <div className="portal-choice-actions">
      <button className={`secondary-button ${tab==='products'?'active':''}`} onClick={()=>setTab('products')}>المنتجات</button>
      <button className={`secondary-button ${tab==='inventory'?'active':''}`} onClick={()=>setTab('inventory')}>المخزون</button>
      <button className={`secondary-button ${tab==='orders'?'active':''}`} onClick={()=>setTab('orders')}>طلبات المتجر</button>
    </div>
    {error&&<div className="info-strip warning">{error}</div>}{message&&<div className="info-strip">{message}</div>}

    {tab==='products'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">PRODUCT MASTER</p><h2>إضافة منتج</h2><form className="form-stack" onSubmit={createProduct}>
        <label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
        <label>اسم المنتج<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>التصنيف<select required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>العلامة التجارية<select value={form.brandId} onChange={e=>setForm({...form,brandId:e.target.value})}><option value="">بدون علامة</option>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>تكلفة الشراء<input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={e=>setForm({...form,purchaseCost:e.target.value})}/></label>
        <label>سعر البيع<input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/></label>
        <label>رمز الضريبة<input value={form.taxCode} onChange={e=>setForm({...form,taxCode:e.target.value})} placeholder="اتركه فارغًا حتى إعداد محرك الضريبة"/></label>
        <label>حد إعادة الطلب<input type="number" min="0" step="0.001" value={form.reorderPoint} onChange={e=>setForm({...form,reorderPoint:e.target.value})}/></label>
        <button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'حفظ المنتج'}</button>
      </form></section>
      <section className="panel"><div className="panel-heading-row"><div><p className="eyebrow">CATALOG</p><h2>المنتجات</h2></div></div><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>التصنيف</th><th>التكلفة</th><th>البيع</th><th>الحالة</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{p.categoryName??'—'}</td><td>{p.purchaseCost}</td><td>{p.sellingPrice}</td><td>{p.active?'نشط':'موقوف'}</td></tr>)}</tbody></table></div></section>
    </section>}

    {tab==='inventory'&&<section className="staff-management-grid">
      <section className="panel"><p className="eyebrow">STOCK MOVEMENT</p><h2>تسوية المخزون</h2><form className="form-stack" onSubmit={adjustStock}>
        <label>المنتج<select required value={adjust.productId} onChange={e=>setAdjust({...adjust,productId:e.target.value})}><option value="">اختر المنتج</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>
        <label>الكمية <small>موجب إضافة / سالب صرف</small><input type="number" step="0.001" required value={adjust.quantity} onChange={e=>setAdjust({...adjust,quantity:e.target.value})}/></label>
        <label>ملاحظة<textarea value={adjust.notes} onChange={e=>setAdjust({...adjust,notes:e.target.value})}/></label>
        <button className="primary-action button" disabled={saving}>{saving?'جارٍ الحفظ...':'تسجيل الحركة'}</button>
      </form></section>
      <section className="panel"><p className="eyebrow">ON HAND</p><h2>الأرصدة الحالية</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>SKU</th><th>المنتج</th><th>الرصيد</th><th>حد الطلب</th><th>قيمة التكلفة</th></tr></thead><tbody>{inventory.map(x=><tr key={x.productId}><td>{x.sku}</td><td>{x.name}</td><td>{x.quantity}</td><td>{x.reorderPoint}</td><td>{(Number(x.quantity)*Number(x.purchaseCost)).toFixed(2)} ر.س</td></tr>)}</tbody></table></div></section>
    </section>}

    {tab==='orders'&&<section className="panel"><p className="eyebrow">CUSTOMER ORDERS</p><h2>طلبات العملاء</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>الطلب</th><th>الحالة</th><th>الإجمالي</th><th>الدفع</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.orderNumber}</td><td>{o.status}</td><td>{o.total} ر.س</td><td>{o.paymentStatus}</td><td>{new Date(o.createdAt).toLocaleString('ar-SA')}</td><td>{o.status==='pending'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'confirmed')}>تأكيد</button>}{o.status==='confirmed'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'completed')}>إكمال</button>}{o.status!=='completed'&&o.status!=='cancelled'&&<button className="secondary-button" onClick={()=>void setOrderStatus(o.id,'cancelled')}>إلغاء</button>}</td></tr>)}</tbody></table></div></section>}
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

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/health" element={<Health />} />

      <Route path="/customer" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <Login portal="customer" onLogin={setUser} />} />
      <Route path="/customer/login" element={<Navigate to="/customer" replace />} />
      <Route path="/customer/register" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <Register onLogin={setUser} />} />
      <Route path="/customer/forgot-password" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <ForgotPassword />} />
      <Route path="/customer/reset-password" element={user ? <Navigate to={user.role === 'customer' ? '/customer/home' : '/admin/dashboard'} replace /> : <ResetPassword />} />
      <Route path="/customer/home" element={customerGuard ? <CustomerPortal onLogout={() => setUser(null)} /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/customer" replace />} />
      <Route path="/customer/store" element={customerGuard ? <CustomerStore /> : user ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/customer" replace />} />

      <Route path="/admin" element={user ? <Navigate to={user.role === 'staff' ? '/admin/dashboard' : '/customer/home'} replace /> : <Login portal="staff" onLogin={setUser} />} />
      <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/dashboard" element={staffGuard ? <StaffDashboard user={user} onLogout={() => setUser(null)} /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/staff" element={staffGuard ? <StaffManagement /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/operations" element={staffGuard ? <StaffOperations /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />

      <Route path="/login" element={<Navigate to="/customer" replace />} />
      <Route path="/register" element={<Navigate to="/customer/register" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/customer/forgot-password" replace />} />
      <Route path="/reset-password" element={<Navigate to="/customer/reset-password" replace />} />

      <Route path="/customers" element={staffGuard ? <Customers /> : user ? <Navigate to="/customer/home" replace /> : <Navigate to="/admin" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
