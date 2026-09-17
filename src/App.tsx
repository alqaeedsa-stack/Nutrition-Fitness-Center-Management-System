import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiFetch } from './lib/api';

type AccountType = 'staff' | 'customer';

type AuthUser = {
  id: string;
  centerId: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  accountType: AccountType;
  customerId?: string | null;
  customerNumber?: string | null;
};

type CenterOption = { code: string; name: string };

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
      navigate(result.user.accountType === 'customer' ? '/portal' : '/dashboard', { replace: true });
    } catch {
      setError('بيانات الدخول غير صحيحة أو تعذر الاتصال بخدمة النظام.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-block">
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>الموظفون يدخلون بحسابات أنشأها المدير، والعملاء يدخلون بحساباتهم الشخصية.</p>
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
        <div className="auth-links">
          <Link className="text-link" to="/register">إنشاء حساب عميل</Link>
          <Link className="text-link" to="/">العودة للواجهة التعريفية</Link>
        </div>
      </section>
    </main>
  );
}

function Register({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const navigate = useNavigate();
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [centerCode, setCenterCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [centersLoading, setCentersLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ centers: CenterOption[] }>('/auth/customer/centers')
      .then((result) => {
        if (!active) return;
        setCenters(result.centers);
        if (result.centers.length === 1) setCenterCode(result.centers[0].code);
      })
      .catch(() => {
        if (active) setError('تعذر تحميل المراكز المتاحة للتسجيل.');
      })
      .finally(() => {
        if (active) setCentersLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    if (password.length < 10) {
      setError('كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.');
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ user: AuthUser }>('/auth/customer/register', {
        method: 'POST',
        body: JSON.stringify({ centerCode, firstName, lastName, phone, email, password }),
      });
      onLogin(result.user);
      navigate('/portal', { replace: true });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '';
      setError(message.includes('409') ? 'البريد الإلكتروني أو رقم الجوال مستخدم بالفعل.' : 'تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <div className="brand-block">
          <span className="eyebrow">Customer Portal</span>
          <h1 id="register-title">إنشاء حساب عميل</h1>
          <p>أنشئ حسابك للوصول إلى مواعيدك وقياساتك وخططك ومتابعتك.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            المركز
            <select value={centerCode} onChange={(event) => setCenterCode(event.target.value)} required disabled={centersLoading || centers.length === 0}>
              <option value="">اختر المركز</option>
              {centers.map((center) => <option key={center.code} value={center.code}>{center.name}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>
              الاسم الأول
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required />
            </label>
            <label>
              اسم العائلة
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required />
            </label>
          </div>
          <label>
            رقم الجوال
            <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" required />
          </label>
          <label>
            البريد الإلكتروني <span className="optional">اختياري</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            كلمة المرور
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
          </label>
          <label>
            تأكيد كلمة المرور
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-action button" type="submit" disabled={loading || centersLoading || centers.length === 0 || !centerCode}>
            {loading ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>
        </form>
        <div className="auth-links">
          <Link className="text-link" to="/login">لديك حساب؟ تسجيل الدخول</Link>
          <Link className="text-link" to="/">العودة</Link>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [logoutLoading, setLogoutLoading] = useState(false);

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

  if (user.accountType !== 'staff') return <Navigate to="/portal" replace />;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1>لوحة إدارة المركز</h1>
        </div>
        <button className="secondary-button" onClick={logout} disabled={logoutLoading}>
          {logoutLoading ? '...' : 'تسجيل الخروج'}
        </button>
      </header>

      <section className="dashboard-intro">
        <p className="eyebrow">نظرة عامة</p>
        <h2>مرحبًا بك في نظام إدارة المركز</h2>
        <p>الوصول إلى وحدات الإدارة حسب الصلاحيات الممنوحة لحساب الموظف.</p>
      </section>

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

function CustomerPortal({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [logoutLoading, setLogoutLoading] = useState(false);

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

  if (user.accountType !== 'customer') return <Navigate to="/dashboard" replace />;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Customer Portal</span>
          <h1>بوابة العميل</h1>
        </div>
        <button className="secondary-button" onClick={logout} disabled={logoutLoading}>
          {logoutLoading ? '...' : 'تسجيل الخروج'}
        </button>
      </header>
      <section className="dashboard-intro">
        <p className="eyebrow">ملفي</p>
        <h2>مرحبًا بك في بوابتك</h2>
        <p>رقم العميل: {user.customerNumber ?? '—'}</p>
      </section>
      <section className="module-grid" aria-label="خدمات العميل">
        {[
          ['مواعيدي', 'Appointments', 'مواعيد المركز والحجوزات القادمة.'],
          ['قياساتي', 'Measurements', 'القياسات المسجلة وتطورها مع الوقت.'],
          ['خطتي الغذائية', 'Nutrition Plans', 'الخطط الغذائية والتعليمات المخصصة لك.'],
          ['خطة اللياقة', 'Fitness Plans', 'خطة التمارين واللياقة الخاصة بك.'],
          ['تقاريري', 'Reports', 'التقارير المتاحة من المركز.'],
          ['مشترياتي', 'Purchases', 'المشتريات والفواتير المرتبطة بحسابك.'],
        ].map(([title, code, description]) => (
          <article className="module-card" key={code}>
            <span className="module-code">{code}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="module-status">قيد البناء</span>
          </article>
        ))}
      </section>
    </main>
  );
}

function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1>نظام إدارة المركز</h1>
        </div>
        <span className="status">Foundation</span>
      </header>

      <section className="welcome" aria-labelledby="welcome-title">
        <p className="eyebrow">الأساس البرمجي</p>
        <h2 id="welcome-title">نظام واحد للمركز والعميل</h2>
        <p>الموظفون يدخلون بحسابات يديرها المدير، والعملاء ينشئون حساباتهم للوصول الآمن إلى بوابتهم الشخصية.</p>
        <div className="home-actions">
          <Link className="primary-action" to="/login">تسجيل الدخول</Link>
          <Link className="secondary-button home-secondary" to="/register">إنشاء حساب عميل</Link>
        </div>
      </section>
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
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ user: AuthUser }>('/auth/me')
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (authLoading) {
    return <main className="auth-page"><section className="auth-card loading-card">جارٍ التحقق من الجلسة...</section></main>;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/health" element={<Health />} />
      <Route path="/login" element={user ? <Navigate to={user.accountType === 'customer' ? '/portal' : '/dashboard'} replace /> : <Login onLogin={setUser} />} />
      <Route path="/register" element={user ? <Navigate to={user.accountType === 'customer' ? '/portal' : '/dashboard'} replace /> : <Register onLogin={setUser} />} />
      <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="/portal" element={user ? <CustomerPortal user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
