// Email templates. Pure functions that return a {subject, html, text} triple.
// Bilingual — render in the recipient's preferred_language. HTML is kept
// deliberately simple (inline styles, no external fonts/images) so
// Gmail/Outlook/Apple Mail all render consistently.

export type ExportReadyInput = {
  locale: 'ar' | 'en';
  recipient_name: string;
  job_id: string;
  app_url: string; // e.g. https://app.example.com (no trailing slash)
};

export function exportReadyTemplate(input: ExportReadyInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const appUrl = input.app_url.replace(/\/$/, '');
  // Route into the role-neutral exports index; the server-side page
  // filters by RLS, so the link works for admin / supervisor / client.
  const pathByRole = `/${input.locale}/admin/exports`;
  const link = `${appUrl}${pathByRole}?job=${encodeURIComponent(input.job_id)}`;

  const strings = isAr
    ? {
        subject: 'ملف التصدير جاهز',
        greeting: `مرحباً ${input.recipient_name}،`,
        body: 'ملف التصدير الذي طلبته جاهز للتنزيل. اضغط الرابط أدناه لفتح صفحة التصدير والحصول على رابط تنزيل آمن قصير الأجل.',
        cta: 'فتح صفحة التصدير',
        note: 'رابط التنزيل صالح لمدة خمس دقائق من وقت الضغط عليه. إذا انتهت صلاحيته، اضغط "تنزيل" مجدداً للحصول على رابط جديد.',
        signature: '— Perception',
      }
    : {
        subject: 'Your export is ready',
        greeting: `Hi ${input.recipient_name},`,
        body: 'The export you requested is ready. Click the link below to open the exports page and get a short-lived secure download link.',
        cta: 'Open Exports page',
        note: 'The download link is valid for five minutes from when you click it. If it expires, click "Download" again to mint a fresh one.',
        signature: '— Perception',
      };

  const dir = isAr ? 'rtl' : 'ltr';

  const html = `<!doctype html>
<html lang="${input.locale}" dir="${dir}">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:Arial,Helvetica,sans-serif;color:#171717;line-height:1.5;">
    <div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;">
      <p style="margin:0 0 16px 0;font-size:15px;">${strings.greeting}</p>
      <p style="margin:0 0 16px 0;font-size:14px;">${strings.body}</p>
      <p style="margin:24px 0;">
        <a href="${link}"
           style="display:inline-block;padding:10px 16px;background:#0abcd4;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
          ${strings.cta}
        </a>
      </p>
      <p style="margin:0 0 16px 0;font-size:12px;color:#525252;">${strings.note}</p>
      <p style="margin:24px 0 0 0;font-size:12px;color:#737373;" dir="ltr">
        <a href="${link}" style="color:#0abcd4;">${link}</a>
      </p>
      <p style="margin:24px 0 0 0;font-size:12px;color:#737373;">${strings.signature}</p>
    </div>
  </body>
</html>`;

  const text = [
    strings.greeting,
    '',
    strings.body,
    '',
    link,
    '',
    strings.note,
    '',
    strings.signature,
  ].join('\n');

  return { subject: strings.subject, html, text };
}
