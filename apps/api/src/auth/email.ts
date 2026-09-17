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
  if (!response.ok) throw new Error(`TurboSMTP rejected the message (${response.status}): ${raw.slice(0, 500)}`);
}
