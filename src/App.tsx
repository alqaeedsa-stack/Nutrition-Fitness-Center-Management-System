import { Link, Route, Routes } from 'react-router-dom';

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
        <p>
          هذه أول طبقة تشغيلية للنظام: React وTypeScript وRTL وRouting، بدون بيانات
          وهمية وبدون منطق أعمال قبل بناء المصادقة والصلاحيات.
        </p>
        <Link className="primary-action" to="/health">فحص النظام</Link>
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
        <p>واجهة التطبيق الأساسية تعمل محليًا. لم يتم توصيل قاعدة البيانات أو خدمات الإنتاج بعد.</p>
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
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/health" element={<Health />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
