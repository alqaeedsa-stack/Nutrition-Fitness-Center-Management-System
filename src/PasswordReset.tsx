import { FormEvent, ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from './lib/api';

function AuthShell({ children }: { children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark small">N</div>
    <div className="brand-block"><span className="eyebrow">Nutrition & Fitness Center</span>{children}</div>
  </section></main>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال طلب إعادة التعيين.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell>
    <h1>نسيت كلمة المرور؟</h1>
    <p>أدخل البريد الإلكتروني المرتبط بحسابك وسنرسل لك رابطًا آمنًا لإعادة تعيين كلمة المرور.</p>
    <form onSubmit={submit} className="form-stack">
      <label>البريد الإلكتروني<input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="info-strip">{message}</div>}
      <button className="primary-action button" type="submit" disabled={loading}>{loading ? 'جارٍ إرسال الرابط...' : 'إرسال رابط إعادة التعيين'}</button>
    </form>
    <div className="auth-switch"><Link className="text-link" to="/customer">العودة إلى تسجيل الدخول</Link></div>
  </AuthShell>;
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!token) { setError('رابط إعادة التعيين غير صالح.'); return; }
    if (password !== confirmPassword) { setError('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setMessage(result.message);
      setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير كلمة المرور.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell>
    <h1>تعيين كلمة مرور جديدة</h1>
    <p>اختر كلمة مرور جديدة لا تقل عن 10 أحرف. رابط إعادة التعيين صالح لمدة 30 دقيقة ويستخدم مرة واحدة.</p>
    <form onSubmit={submit} className="form-stack">
      <label className="password-field">كلمة المرور الجديدة
        <div className="password-input-wrap">
          <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
          <button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? 'إخفاء' : 'عرض'}</button>
        </div>
      </label>
      <label className="password-field">تأكيد كلمة المرور
        <div className="password-input-wrap">
          <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
          <button className="password-toggle" type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'} title={showConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}>{showConfirmPassword ? 'إخفاء' : 'عرض'}</button>
        </div>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="info-strip">{message} جارٍ تحويلك لتسجيل الدخول...</div>}
      <button className="primary-action button" type="submit" disabled={loading}>{loading ? 'جارٍ حفظ كلمة المرور...' : 'حفظ كلمة المرور الجديدة'}</button>
    </form>
    <div className="auth-switch"><Link className="text-link" to="/login">العودة إلى تسجيل الدخول</Link></div>
  </AuthShell>;
}
