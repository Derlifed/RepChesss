// Password reset emails via Resend (https://resend.com). Needs RESEND_API_KEY; see README.
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendResetEmail(to, link) {
  const from = process.env.EMAIL_FROM || 'RepChess <onboarding@resend.dev>';
  const text = `Someone asked to reset the password for your RepChess account.\n\nSet a new password: ${link}\n\nThis link works for 1 hour and can be used once. If you did not ask for this, you can ignore this email.`;
  const html = `<p>Someone asked to reset the password for your RepChess account.</p><p><a href="${link}">Set a new password</a></p><p>This link works for 1 hour and can be used once. If you did not ask for this, you can ignore this email.</p>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: 'Reset your RepChess password', text, html }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Resend returned ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
}
