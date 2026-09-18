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
    ['المخزون', 'INVENTORY', 'المنتجات والأرصدة وحركات المخزون والجرد.', ''],
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
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string; sellingPrice: string; taxCode?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ products: typeof products }>('/customer-portal/store/products')
      .then(result => setProducts(result.products))
      .catch(err => setError(err instanceof Error ? err.message : 'تعذر تحميل منتجات المتجر'))
      .finally(() => setLoading(false));
  }, []);

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
        <h2>المنتجات المتاحة</h2>
        <p>هذه واجهة المتجر الخاصة بالعملاء. الأسعار المعروضة من كتالوج المنتجات الفعلي في النظام.</p>
      </section>
      {loading && <div className="info-strip">جارٍ تحميل المنتجات...</div>}
      {error && <div className="info-strip warning">{error}</div>}
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
              <span className="module-status">متاح للشراء عند تفعيل الطلبات الإلكترونية</span>
            </article>
          ))}
        </section>
      )}
    </main>
  );
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
