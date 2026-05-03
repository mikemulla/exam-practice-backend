async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  if (!process.env.EMAIL_FROM_EMAIL) {
    throw new Error("EMAIL_FROM_EMAIL is not configured");
  }

  const payload = {
    sender: {
      name: process.env.EMAIL_FROM_NAME || "Exam Practice",
      email: process.env.EMAIL_FROM_EMAIL,
    },
    to: Array.isArray(to) ? to.map((email) => ({ email })) : [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  if (attachments.length > 0) {
    payload.attachment = attachments;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `Brevo email failed with status ${response.status}`,
    );
  }

  return data;
}

module.exports = { sendEmail };
