/**
 * Cloudflare Pages Function —— 询盘接收端点
 * 路由：POST /api/inquiry（文件位置即路由：functions/api/inquiry.js）
 *
 * 主通道：Brevo 事务邮件 API
 *   BREVO_API_KEY          Brevo → SMTP & API → API Keys 里创建的 v3 key
 *   INQUIRY_FROM_EMAIL     发件地址，必须是已在 Brevo 验证过的发件人/域名
 *   INQUIRY_FROM_NAME      发件人显示名，缺省 "TORLIRO Website"
 *   INQUIRY_TO             收件地址，缺省 sales@tuojieoutdoor.com
 *   BREVO_LIST_ID          可选。填了就顺带把联系人写进该列表（失败不影响发信）
 *
 * 备选通道：Resend（只在没配 BREVO_API_KEY、但配了下面两个时生效）
 *   RESEND_API_KEY / MAIL_FROM
 *
 * 两边都没配 → 503，前端会提示"请直接发邮件"，不会静默丢单。
 * 任何 key 都只存在服务端，绝不要写进 assets/js/main.js。
 */

const REQUIRED = ["name", "company", "email", "country", "interest", "message"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEFAULT_TO = "sales@tuojieoutdoor.com";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// 邮件正文里拼入用户输入，必须转义，避免被塞进标签
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function buildHtml(fields, volume, source, received) {
  const rows = [
    ["Name", fields.name],
    ["Company", fields.company],
    ["Email", fields.email],
    ["Country", fields.country],
    ["Interest", fields.interest],
    ["Volume", volume || "—"],
    ["Page", source || "—"],
    ["Time", received]
  ];

  const table = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 16px 6px 0;color:#5c6b64;font:500 12px/1.6 Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;color:#1d352d;font:400 15px/1.6 Arial,sans-serif;">${esc(value)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:24px;background:#f3efe5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:20px 28px;background:#1d352d;color:#ffffff;font:600 16px/1.4 Arial,sans-serif;">
      New website inquiry
    </td></tr>
    <tr><td style="padding:24px 28px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${table}</table>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;">
      <div style="margin:8px 0 0;color:#5c6b64;font:500 12px/1.6 Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;">Message</div>
      <div style="margin-top:6px;padding:16px;background:#f7f5ef;border-left:3px solid #da6f2b;color:#1d352d;font:400 15px/1.7 Arial,sans-serif;white-space:pre-wrap;">${esc(fields.message)}</div>
    </td></tr>
    <tr><td style="padding:14px 28px;background:#f7f5ef;color:#5c6b64;font:400 12px/1.6 Arial,sans-serif;">
      Reply directly to this email — Reply-To is set to the enquiry address.
    </td></tr>
  </table>
</body></html>`;
}

async function sendViaBrevo(env, fields, subject, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: env.INQUIRY_FROM_NAME || "TORLIRO Website",
        email: env.INQUIRY_FROM_EMAIL
      },
      to: [{ email: env.INQUIRY_TO || DEFAULT_TO }],
      replyTo: { email: fields.email, name: fields.name },
      subject,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("brevo error", res.status, detail);
    return false;
  }
  return true;
}

// 可选：把询盘写进 Brevo 联系人列表；任何失败都只记日志，不影响主邮件
async function syncBrevoContact(env, fields) {
  if (!env.BREVO_LIST_ID) return;
  const listId = Number(env.BREVO_LIST_ID);
  if (!Number.isInteger(listId) || listId <= 0) return;

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        email: fields.email,
        attributes: {
          FIRSTNAME: fields.name,
          COMPANY: fields.company,
          COUNTRY: fields.country
        },
        listIds: [listId],
        updateEnabled: true
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("brevo contact error", res.status, detail);
    }
  } catch (err) {
    console.error("brevo contact failed", err);
  }
}

async function sendViaResend(env, fields, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.INQUIRY_TO || DEFAULT_TO],
      reply_to: fields.email,
      subject,
      html
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("resend error", res.status, detail);
    return false;
  }
  return true;
}

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  // 蜜罐：真人看不到这个字段，被填了就当机器人，直接返回成功（不投递）
  if (typeof data._gotcha === "string" && data._gotcha.trim() !== "") {
    return json({ ok: true });
  }

  const fields = {};
  for (const key of REQUIRED) {
    const value = typeof data[key] === "string" ? data[key].trim() : "";
    if (!value) return json({ ok: false, error: `Missing field: ${key}` }, 422);
    fields[key] = value.slice(0, 2000);
  }
  if (!EMAIL_RE.test(fields.email)) {
    return json({ ok: false, error: "Please use a valid email address." }, 422);
  }
  if (fields.message.length < 20) {
    return json({ ok: false, error: "Please add a little more detail." }, 422);
  }

  const volume = typeof data.volume === "string" ? data.volume.trim().slice(0, 200) : "";
  const source = typeof data.source === "string" ? data.source.slice(0, 200) : "";
  const received = new Date().toISOString();

  const subject = `New inquiry — ${fields.company} (${fields.country})`;
  const html = buildHtml(fields, volume, source, received);

  const hasBrevo = Boolean(env.BREVO_API_KEY && env.INQUIRY_FROM_EMAIL);
  const hasResend = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

  if (!hasBrevo && !hasResend) {
    return json(
      { ok: false, error: "Mail transport is not configured yet." },
      503
    );
  }

  const sent = hasBrevo
    ? await sendViaBrevo(env, fields, subject, html)
    : await sendViaResend(env, fields, subject, html);

  if (!sent) {
    return json({ ok: false, error: "Mail service rejected the message." }, 502);
  }

  if (hasBrevo) await syncBrevoContact(env, fields);

  return json({ ok: true, received });
}

// 其它方法一律拒绝，避免被当成开放接口试探
export async function onRequest({ request }) {
  return json({ ok: false, error: "Method not allowed." }, 405);
}
