// Cloudflare Worker for this Meno static site.
//
// Handles the contact form's POST /api/send-email (forwards the submission to
// Resend) and serves everything else from the prerendered static assets.
//
// ───────────────────────────────────────────────────────────────────────────
// SETUP (the person deploying this site fills these in — they are NOT in the repo):
//
//   1. RESEND_API_KEY  (required, SECRET) — your Resend API key:
//        npx wrangler secret put RESEND_API_KEY
//   2. TO_EMAIL        (required) — the inbox that receives submissions. Either:
//        npx wrangler secret put TO_EMAIL        (or add it as a var in wrangler.jsonc)
//
// FROM_EMAIL defaults to Resend's sandbox sender (onboarding@resend.dev), which
// works immediately with NO domain verification — BUT in that mode Resend only
// delivers to the email address your Resend account is registered with. So the
// simplest setup with ZERO domain config: set TO_EMAIL to that same account
// email. (RESEND_API_KEY + TO_EMAIL is then all you need.)
//
// To receive at a DIFFERENT inbox, or send from your own branded address, verify
// your domain in Resend and set FROM_EMAIL to an address on it (var or secret).
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_FROM = 'onboarding@resend.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/send-email' && request.method === 'POST') {
      return handleSendEmail(request, env);
    }
    // Everything else is served from the prerendered static assets.
    return env.ASSETS.fetch(request);
  },
};

// Universal email sender: collects ALL string form fields and forwards them to
// Resend, so it works with any form without per-form changes. The browser POSTs
// a normal (urlencoded/multipart) form, hence request.formData().
async function handleSendEmail(request, env) {
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });

  try {
    const formData = await request.formData();
    const fields = [];
    for (const [name, value] of formData.entries()) {
      if (value && typeof value === 'string') fields.push({ name, value });
    }
    if (fields.length === 0) {
      return reply({ success: false, error: 'No form data received' }, 400);
    }

    if (!env.RESEND_API_KEY || !env.TO_EMAIL) {
      // Most likely the deployer hasn't set RESEND_API_KEY / TO_EMAIL yet (see SETUP above).
      console.error('Missing required env: set RESEND_API_KEY (secret) and TO_EMAIL.');
      return reply({ success: false, error: 'Server configuration error' }, 500);
    }

    const textBody = fields.map((f) => `${formatFieldName(f.name)}: ${f.value}`).join('\n');
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    table { border-collapse: collapse; width: 100%; max-width: 600px; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    td:first-child { font-weight: 600; color: #333; width: 30%; }
    td:last-child { color: #666; }
    h2 { color: #333; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h2>New Form Submission</h2>
  <table>
    ${fields
      .map((f) => `<tr><td>${escapeHtml(formatFieldName(f.name))}</td><td>${escapeHtml(f.value)}</td></tr>`)
      .join('\n    ')}
  </table>
</body>
</html>
    `.trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || DEFAULT_FROM,
        to: env.TO_EMAIL,
        subject: env.EMAIL_SUBJECT || 'New Form Submission',
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      console.error('Resend API error:', await res.text());
      return reply({ success: false, error: 'Failed to send email' }, 500);
    }

    return reply({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Email send error:', err);
    return reply({ success: false, error: 'An unexpected error occurred' }, 500);
  }
}

// "firstName" / "full_name" → "First Name"
function formatFieldName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
