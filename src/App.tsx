import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiFetch } from './lib/api';

type AuthUser = {
  id: string;
  centerId: string;
  email?: string | null;
  phone?: string | null;
  status: string;
};

type Customer = {
  id: string;
  centerId: string;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
};

type CustomerAccountResponse = {
  account: { id: string; customerId: string; status: string; createdAt: string; updatedAt: string };
  customer: Customer;
};

function Login({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{ user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      onLogin(result.user);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('تعذر تسجيل الدخول. تحقق من البيانات واتصال خدمة النظام.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-mark small">N</div>
        <div className="brand-block">
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>ادخل إلى مساحة العمل الخاصة بك وأدر المركز من مكان واحد.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            البريد الإلكتروني أو الجوال
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            كلمة المرور
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-action button" type="submit" disabled={loading}>
            {loading ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
          </button>
        </form>
        <Link className="text-link" to="/">العودة للرئيسية</Link>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accountError, setAccountError] = useState('');
  const [accountLoading, setAccountLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<CustomerAccountResponse>('/customer-account/me')
      .then((result) => { if (active) setCustomer(result.customer); })
      .catch(() => { if (active) setAccountError('لا يوجد ملف عميل مرتبط بهذا الحساب حتى الآن.'); })
      .finally(() => { if (active) setAccountLoading(false); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setLogoutLoading(true);
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      onLogout();
      navigate('/login', { replace: true });
      setLogoutLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-inline">
          <div className="brand-mark">N</div>
          <div>
            <span className="eyebrow">Nutrition & Fitness Center</span>
            <h1>لوحة إدارة المركز</h1>
          </div>
        </div>
        <button className="secondary-button" onClick={logout} disabled={logoutLoading}>
          {logoutLoading ? '...' : 'تسجيل الخروج'}
        </button>
      </header>

      <section className="dashboard-intro">
        <p className="eyebrow">نظرة عامة</p>
        <h2>{customer?.fullName ? `مرحبًا ${customer.fullName}` : 'مرحبًا بك في نظام إدارة المركز'}</h2>
        <p>مساحة تشغيل موحدة للعملاء والمواعيد والقياسات والخطط والمبيعات والمخزون.</p>
      </section>

      {accountLoading && <div className="info-strip">جارٍ تحميل ملف العميل...</div>}
      {accountError && <div className="info-strip warning">{accountError}</div>}
      {customer && (
        <section className="customer-summary">
          <div><span className="eyebrow">ملف العميل</span><strong>{customer.fullName ?? 'عميل'}</strong></div>
          <div><span className="eyebrow">الجوال</span><span>{customer.phone ?? '—'}</span></div>
          <div><span className="eyebrow">الحالة</span><span className="active-dot">نشط</span></div>
        </section>
      )}

      <section className="module-grid" aria-label="وحدات النظام">
        {[
          ['العملاء', 'Customer 360', 'ملف العميل والبيانات الأساسية والمتابعة.'],
          ['المواعيد', 'Appointments', 'الحجوزات والمتابعة ومواعيد المركز.'],
          ['القياسات', 'Measurements', 'القياسات والتغيرات والتقارير المرتبطة بالعميل.'],
          ['الخطط الغذائية', 'Nutrition Plans', 'إعداد وإدارة الخطط الغذائية.'],
          ['اللياقة', 'Fitness Plans', 'خطط التدريب واللياقة.'],
          ['المبيعات', 'POS', 'المبيعات والفواتير والمرتجعات.'],
          ['المخزون', 'Inventory', 'الأصناف وحركات المخزون والجرد.'],
          ['التقارير', 'Reports', 'تقارير الإدارة والتحليل.'],
        ].map(([title, code, description]) => (
          <article className="module-card" key={code}>
            <span className="module-code">{code}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="module-status">قيد البناء</span>
          </article>
        ))}
      </section>

      <footer className="app-footer">
        <span>حساب المركز: {user.centerId}</span>
        <span>{user.email ?? user.phone ?? 'حساب مستخدم'}</span>
      </footer>
    </main>
  );
}

function Home() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <div className="brand-inline">
          <div className="brand-mark">N</div>
          <div className="brand-name"><strong>Nutrition</strong><span>& Fitness Center</span></div>
        </div>
        <Link className="nav-login" to="/login">تسجيل الدخول</Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">إدارة المركز من مكان واحد</span>
          <h1>نظام متكامل لإدارة <em>التغذية واللياقة</em></h1>
          <p>نظّم عملاءك ومواعيدك وقياساتهم وخططهم الغذائية والرياضية ومبيعاتك ومخزونك داخل منصة واحدة مصممة لعمل المراكز اليومية.</p>
          <div className="hero-actions">
            <Link className="primary-action" to="/login">دخول النظام <span>←</span></Link>
            <a className="secondary-hero" href="#features">اكتشف المزايا</a>
          </div>
          <div className="trust-row">
            <span>بياناتك في مكان واحد</span>
            <span>صلاحيات حسب الدور</span>
            <span>واجهة عربية RTL</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="dashboard-window">
            <div className="window-top"><span></span><span></span><span></span></div>
            <div className="window-content">
              <div className="mini-sidebar"><b>N</b><i></i><i></i><i></i><i></i></div>
              <div className="mini-main">
                <div className="mini-title"><span></span><b></b></div>
                <div className="mini-cards"><div></div><div></div><div></div></div>
                <div className="mini-chart"><span></span><span></span><span></span><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
          <div className="float-card one"><b>+24</b><span>موعد اليوم</span></div>
          <div className="float-card two"><b>96%</b><span>متابعة العملاء</span></div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="section-heading">
          <span className="eyebrow">كل ما يحتاجه المركز</span>
          <h2>تشغيل أوضح. متابعة أفضل.</h2>
          <p>المعلومات التي تحتاجها في وقتها، بدون تشتيت بين ملفات وأدوات متعددة.</p>
        </div>
        <div className="feature-grid">
          <article><span className="feature-number">01</span><h3>ملف العميل</h3><p>بيانات العميل وقياساته وخططه وتاريخه في سياق واحد.</p></article>
          <article><span className="feature-number">02</span><h3>الخطط والمتابعة</h3><p>إدارة الخطط الغذائية والرياضية وربطها بمتابعة العميل.</p></article>
          <article><span className="feature-number">03</span><h3>المواعيد والمبيعات</h3><p>تنظيم الحجوزات والمبيعات والمرتجعات داخل سير عمل واضح.</p></article>
          <article><span className="feature-number">04</span><h3>المخزون والتقارير</h3><p>متابعة الأصناف والحركات والتقارير التي تساعد الإدارة على اتخاذ القرار.</p></article>
        </div>
      </section>

      <section className="closing">
        <div>
          <span className="eyebrow">ابدأ من هنا</span>
          <h2>جاهز لإدارة مركزك بشكل أكثر تنظيمًا؟</h2>
          <p>سجّل الدخول للوصول إلى مساحة العمل الخاصة بك.</p>
        </div>
        <Link className="primary-action" to="/login">دخول النظام <span>←</span></Link>
      </section>

      <footer className="landing-footer">
        <span>Nutrition & Fitness Center</span>
        <span>نظام إدارة متكامل للمراكز</span>
      </footer>
    </main>
  );
}

function Health() {
  return (
    <main className="shell narrow">
      <section className="panel">
        <p className="eyebrow">System Health</p>
        <h1>النظام يعمل</h1>
        <p>واجهة التطبيق الأساسية تعمل. حالة قاعدة البيانات وخدمات الإنتاج تُفحص من طبقة الـ API.</p>
        <Link className="text-link" to="/">العودة</Link>
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main className="shell narrow">
      <section className="panel">
        <p className="eyebrow">404</p>
        <h1>الصفحة غير موجودة</h1>
        <Link className="text-link" to="/">العودة للرئيسية</Link>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    apiFetch<{ user: AuthUser }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  if (authChecking) {
    return (
      <main className="loading-page">
        <div className="brand-mark">N</div>
        <p>جارٍ تحميل النظام...</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/health" element={<Health />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />} />
      <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
