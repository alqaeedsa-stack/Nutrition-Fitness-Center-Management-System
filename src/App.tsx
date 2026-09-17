import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Customers from './Customers';
import { apiFetch } from './lib/api';

type AuthUser = { id: string; centerId?: string | null; email?: string | null; phone?: string | null; status: string };
type Customer = { id: string; centerId: string; customerNumber: string; firstName: string; lastName: string; phone: string; email?: string | null; status: string };
type CustomerAccountResponse = { account: { id: string; customerId: string; userId: string; status: string; createdAt: string; updatedAt: string }; customer: Customer };
type LoginPortal = 'customer' | 'staff';

function Login({ onLogin, portal = 'customer' }: { onLogin: (user: AuthUser) => void; portal?: LoginPortal }) {
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
      navigate('/dashboard', { replace: true });
    } catch {
      setError(isStaff
        ? 'تعذر دخول الإدارة والموظفين. تحقق من البيانات ونوع الحساب.'
        : 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark small">N</div>
    <div className="brand-block"><span className="eyebrow">Nutrition & Fitness Center</span><h1>{isStaff ? 'دخول الإدارة والموظفين' : 'دخول العملاء'}</h1><p>{isStaff ? 'ادخل إلى مساحة العمل الخاصة بك لإدارة المركز وتشغيل وحداته.' : 'سجّل الدخول بالبريد الإلكتروني لمتابعة ملفك وخططك وقياساتك ومواعيدك.'}</p></div>
    <form onSubmit={submit} className="form-stack">
      <label>{isStaff ? 'البريد الإلكتروني أو الجوال' : 'البريد الإلكتروني'}<input type={isStaff ? 'text' : 'email'} value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required /></label>
      <label>كلمة المرور<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-action button" type="submit" disabled={loading}>{loading ? 'جارٍ التحقق...' : isStaff ? 'دخول مساحة العمل' : 'تسجيل الدخول'}</button>
    </form>
    {!isStaff && <div className="auth-switch">ليس لديك حساب؟ <Link className="text-link" to="/register">تسجيل عميل جديد</Link></div>}
    <div className="auth-switch">{isStaff ? <><span>عميل؟ </span><Link className="text-link" to="/login">دخول العملاء</Link></> : <><span>موظف أو مدير؟ </span><Link className="text-link" to="/staff/login">دخول الإدارة والموظفين</Link></>}</div>
    <Link className="text-link" to="/">العودة للرئيسية</Link>
  </section></main>;
}

function Register({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function update(key: keyof typeof form, value: string) { setForm(prev => ({ ...prev, [key]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!form.email.trim()) { setError('البريد الإلكتروني مطلوب'); return; }
    if (form.phone && !/^\+9665\d{8}$/.test(form.phone.trim())) { setError('رقم الجوال يجب أن يكون بصيغة +9665XXXXXXXX'); return; }
    if (form.password !== form.confirmPassword) { setError('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      const result = await apiFetch<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ ...form, phone: form.phone.trim(), email: form.email.trim() }) });
      onLogin(result.user);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر إنشاء الحساب. تحقق من البيانات.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card register-card">
    <div className="brand-mark small">N</div>
    <div className="brand-block"><span className="eyebrow">Nutrition & Fitness Center</span><h1>إنشاء حساب عميل</h1><p>أنشئ حسابك بالبريد الإلكتروني، وأضف رقم الجوال اختياريًا إذا رغبت.</p></div>
    <form onSubmit={submit} className="form-stack">
      <div className="form-row"><label>الاسم الأول<input value={form.firstName} onChange={e => update('firstName', e.target.value)} required /></label><label>اسم العائلة<input value={form.lastName} onChange={e => update('lastName', e.target.value)} required /></label></div>
      <label>البريد الإلكتروني <span>(مطلوب)</span><input type="email" dir="ltr" value={form.email} onChange={e => update('email', e.target.value)} autoComplete="email" required /></label>
      <label>رقم الجوال <span>(اختياري)</span><input type="tel" dir="ltr" value={form.phone} onChange={e => update('phone', e.target.value)} autoComplete="tel" placeholder="+9665XXXXXXXX" pattern="\\+9665[0-9]{8}" /><small>إذا أضفته، استخدم الصيغة السعودية: +9665XXXXXXXX</small></label>
      <label>كلمة المرور<input type="password" value={form.password} onChange={e => update('password', e.target.value)} autoComplete="new-password" minLength={10} required /><small>10 أحرف على الأقل</small></label>
      <label>تأكيد كلمة المرور<input type="password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} autoComplete="new-password" minLength={10} required /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-action button" type="submit" disabled={loading}>{loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}</button>
    </form>
    <div className="auth-switch">لديك حساب بالفعل؟ <Link className="text-link" to="/login">دخول العملاء</Link></div>
  </section></main>;
}

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch<CustomerAccountResponse>('/customer-account/me')
      .then(r => setCustomer(r.customer))
      .catch(() => setError('لا يوجد ملف عميل مرتبط بهذا الحساب حتى الآن.'))
      .finally(() => setLoading(false));
  }, []);
  async function logout() { try { await apiFetch<void>('/auth/logout', { method: 'POST' }); } finally { onLogout(); navigate('/login', { replace: true }); } }
  const displayName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : '';
  const modules = [
    ['العملاء', 'Customer 360', 'ملف العميل والبيانات الأساسية والمتابعة.', '/customers'],
    ['المواعيد', 'Appointments', 'الحجوزات والمتابعة ومواعيد المركز.', ''],
    ['القياسات', 'Measurements', 'القياسات والتغيرات والتقارير المرتبطة بالعميل.', ''],
    ['الخطط الغذائية', 'Nutrition Plans', 'إعداد وإدارة الخطط الغذائية.', ''],
    ['اللياقة', 'Fitness Plans', 'خطط التدريب واللياقة.', ''],
    ['المبيعات', 'POS', 'المبيعات والفواتير والمرتجعات.', ''],
    ['المخزون', 'Inventory', 'الأصناف وحركات المخزون والجرد.', ''],
    ['التقارير', 'Reports', 'تقارير الإدارة والتحليل.', ''],
  ] as const;
  return <main className="app-shell"><header className="app-header"><div className="brand-inline"><div className="brand-mark">N</div><div><span className="eyebrow">Nutrition & Fitness Center</span><h1>لوحة إدارة المركز</h1></div></div><button className="secondary-button" onClick={logout}>تسجيل الخروج</button></header>
    <section className="dashboard-intro"><p className="eyebrow">نظرة عامة</p><h2>{displayName ? `مرحبًا ${displayName}` : 'مرحبًا بك في نظام إدارة المركز'}</h2><p>مساحة تشغيل موحدة للعملاء والمواعيد والقياسات والخطط والمبيعات والمخزون.</p></section>
    {loading && <div className="info-strip">جارٍ تحميل ملف العميل...</div>}{error && <div className="info-strip warning">{error}</div>}
    {customer && <section className="customer-summary"><div><span className="eyebrow">ملف العميل</span><strong>{displayName}</strong></div><div><span className="eyebrow">الجوال</span><span dir="ltr">{customer.phone || 'لم تتم إضافته'}</span></div><div><span className="eyebrow">الحالة</span><span className="active-dot">نشط</span></div></section>}
    <section className="module-grid" aria-label="وحدات النظام">{modules.map(([title, code, description, path]) => <article className="module-card" key={code}><span className="module-code">{code}</span><h3>{title}</h3><p>{description}</p>{path ? <Link className="module-link" to={path}>فتح الوحدة ←</Link> : <span className="module-status">قيد البناء</span>}</article>)}</section>
    <footer className="app-footer"><span>Nutrition & Fitness Center</span><span>{user.email ?? user.phone ?? 'حساب مستخدم'}</span></footer>
  </main>;
}

function Home() {
  return <main className="landing-page"><nav className="landing-nav"><div className="brand-inline"><div className="brand-mark">N</div><div className="brand-name"><strong>Nutrition</strong><span>& Fitness Center</span></div></div><div className="nav-actions"><Link className="nav-login" to="/login">دخول العملاء</Link><Link className="nav-register" to="/register">تسجيل عميل جديد</Link></div></nav>
    <section className="hero"><div className="hero-copy"><span className="hero-kicker">إدارة المركز من مكان واحد</span><h1>نظام متكامل لإدارة <em>التغذية واللياقة</em></h1><p>نظّم عملاءك ومواعيدك وقياساتهم وخططهم الغذائية والرياضية ومبيعاتك ومخزونك داخل منصة واحدة مصممة لعمل المراكز اليومية.</p><div className="hero-actions"><Link className="primary-action" to="/register">تسجيل عميل جديد <span>←</span></Link><Link className="secondary-hero" to="/login">دخول العملاء</Link></div><div className="trust-row"><span>بياناتك في مكان واحد</span><span>صلاحيات حسب الدور</span><span>واجهة عربية RTL</span></div></div>
      <div className="hero-visual" aria-hidden="true"><div className="dashboard-window"><div className="window-top"><span></span><span></span><span></span></div><div className="window-content"><div className="mini-sidebar"><b>N</b><i></i><i></i><i></i><i></i></div><div className="mini-main"><div className="mini-title"><span></span><b></b></div><div className="mini-cards"><div></div><div></div><div></div></div><div className="mini-chart"><span></span><span></span><span></span><span></span><span></span><span></span></div></div></div></div><div className="float-card one"><b>+24</b><span>موعد اليوم</span></div><div className="float-card two"><b>96%</b><span>متابعة العملاء</span></div></div></section>
    <section id="features" className="features"><div className="section-heading"><span className="eyebrow">كل ما يحتاجه المركز</span><h2>تشغيل أوضح. متابعة أفضل.</h2><p>المعلومات التي تحتاجها في وقتها، بدون تشتيت بين ملفات وأدوات متعددة.</p></div><div className="feature-grid"><article><span className="feature-number">01</span><h3>ملف العميل</h3><p>بيانات العميل وقياساته وخططه وتاريخه في سياق واحد.</p></article><article><span className="feature-number">02</span><h3>الخطط والمتابعة</h3><p>إدارة الخطط الغذائية والرياضية وربطها بمتابعة العميل.</p></article><article><span className="feature-number">03</span><h3>المواعيد والمبيعات</h3><p>تنظيم الحجوزات والمبيعات والمرتجعات داخل سير عمل واضح.</p></article><article><span className="feature-number">04</span><h3>المخزون والتقارير</h3><p>متابعة الأصناف والحركات والتقارير التي تساعد الإدارة على اتخاذ القرار.</p></article></div></section>
    <section className="closing"><div><span className="eyebrow">ابدأ من هنا</span><h2>جاهز لإدارة مركزك بشكل أكثر تنظيمًا؟</h2><p>للعملاء: أنشئ حسابك أو سجّل الدخول. للإدارة والموظفين: استخدم مساحة العمل المخصصة.</p></div><Link className="primary-action" to="/register">تسجيل عميل جديد <span>←</span></Link></section>
    <footer className="landing-footer"><span>Nutrition & Fitness Center</span><span>نظام إدارة متكامل للمراكز</span></footer>
  </main>;
}

function Health() { return <main className="shell narrow"><section className="panel"><p className="eyebrow">System Health</p><h1>النظام يعمل</h1><p>واجهة التطبيق الأساسية تعمل. حالة قاعدة البيانات وخدمات الإنتاج تُفحص من طبقة الـ API.</p><Link className="text-link" to="/">العودة</Link></section></main>; }
function NotFound() { return <main className="shell narrow"><section className="panel"><p className="eyebrow">404</p><h1>الصفحة غير موجودة</h1><Link className="text-link" to="/">العودة للرئيسية</Link></section></main>; }

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  useEffect(() => { apiFetch<{ user: AuthUser }>('/auth/me').then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setAuthChecking(false)); }, []);
  if (authChecking) return <main className="loading-page"><div className="brand-mark">N</div><p>جارٍ تحميل النظام...</p></main>;
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/health" element={<Health />} />
    <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />} />
    <Route path="/staff/login" element={user ? <Navigate to="/dashboard" replace /> : <Login portal="staff" onLogin={setUser} />} />
    <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register onLogin={setUser} />} />
    <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
    <Route path="/customers" element={user ? <Customers /> : <Navigate to="/login" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>;
}