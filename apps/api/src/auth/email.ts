type EmailEnv = {
  TURBOSMTP_CONSUMER_KEY?: string;
  TURBOSMTP_CONSUMER_SECRET?: string;
  TURBOSMTP_FROM_EMAIL?: string;
};

export async function sendPasswordResetEmail(env: EmailEnv, to: string, resetUrl: string) {
  const consumerKey = env.TURBOSMTP_CONSUMER_KEY?.trim();
  const consumerSecret = env.TURBOSMTP_CONSUMER_SECRET?.trim();
  const from = env.TURBOSMTP_FROM_EMAIL?.trim();

  if (!consumerKey || !consumerSecret || !from) {
    throw new Error('خدمة البريد غير مهيأة بالكامل: أضف مفاتيح TurboSMTP وبريد المرسل في Cloudflare Secrets');
  }

  const response = await fetch('https://api.turbo-smtp.com/api/v2/mail/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Consumerkey: consumerKey,
      Consumersecret: consumerSecret,
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'إعادة تعيين كلمة المرور - Nutrition & Fitness Center',
      content: `طلب إعادة تعيين كلمة المرور\n\nاستخدم الرابط التالي لتعيين كلمة مرور جديدة:\n${resetUrl}\n\nصلاحية الرابط 30 دقيقة، ويمكن استخدامه مرة واحدة فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.`,
      html_content: `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:32px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><h2>إعادة تعيين كلمة المرور</h2><p>وصلنا طلبًا لإعادة تعيين كلمة المرور لحسابك.</p><p><a href="${resetUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px">تعيين كلمة مرور جديدة</a></p><p style="color:#475569">صلاحية الرابط 30 دقيقة ويمكن استخدامه مرة واحدة فقط.</p><p style="color:#64748b">إذا لم تطلب هذه العملية، تجاهل الرسالة.</p></div></body></html>`,
    }),
  });

  const raw = await response.text();

  // Keep provider diagnostics in Cloudflare logs without exposing credentials or reset tokens.
  console.log('TurboSMTP password reset response', {
    status: response.status,
    ok: response.ok,
    fromConfigured: Boolean(from),
    fromDomain: from.includes('@') ? from.split('@')[1] : null,
    recipientDomain: to.includes('@') ? to.split('@')[1] : null,
    responseBody: raw.slice(0, 1000),
  });

  if (!response.ok) {
    throw new Error(`TurboSMTP rejected the message (${response.status}): ${raw.slice(0, 500)}`);
  }

  // Some providers return HTTP 200 with a JSON-level failure. Treat explicit failure
  // indicators as an error so the application cannot report a false success.
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
    const message = typeof payload.message === 'string' ? payload.message.toLowerCase() : '';
    const success = typeof payload.success === 'boolean' ? payload.success : undefined;
    const failed = ['error', 'failed', 'failure', 'rejected', 'invalid'].includes(status)
      || message.includes('error')
      || message.includes('failed')
      || message.includes('rejected')
      || success === false;

    if (failed) {
      throw new Error(`TurboSMTP reported a send failure: ${raw.slice(0, 500)}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      // A non-JSON successful response is allowed; the HTTP status is authoritative.
    } else {
      throw error;
    }
  }
}
