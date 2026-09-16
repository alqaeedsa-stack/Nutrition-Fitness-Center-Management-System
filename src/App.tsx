import { FormEvent, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { apiFetch } from './lib/api';

type AuthUser = {
  id: string;
  centerId: string;
  email?: string | null;
  phone?: string | null;
  status: string;
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
        <div className="brand-block">
          <span className="eyebrow">Nutrition & Fitness Center</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>الوصول إلى نظام إدارة المركز حسب الصلاحيات الممنوحة لحسابك.</p>
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
        <Link className="text-link" to="/">العودة للواجهة التعريفية</Link>
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
        <p>هذه هي نقطة البداية التشغيلية. الوحدات ستُفتح تدريجيًا مع تطبيق الصلاحيات وربط قاعدة البيانات.</p>
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
        <h2 id="welcome-title">البنية الأساسية جاهزة لبدء نظام الإدارة</h2>
        <p>تم تجهيز React وTypeScript وRTL وRouting وطبقة الاتصال بالـ API، بدون بيانات وهمية. الخطوة التشغيلية التالية هي المصادقة والصلاحيات.</p>
        <Link className="primary-action" to="/login">دخول النظام</Link>
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
