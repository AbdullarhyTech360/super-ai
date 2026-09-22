"""Transactional email delivery for Super AI.

Supports Resend (HTTP API), generic SMTP, and a "console" provider used in
development that prints the message instead of sending it.
"""

import json
import os
import re
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

APP_NAME = "Super AI"

# Resend blocks requests that don't send a real User-Agent header (403 / error
# code 1010), so identify this application explicitly.
USER_AGENT = "Super-AI/1.0 (+https://super-ai.amrahaz.me)"

GRADIENT = "linear-gradient(135deg, #7a5cff 0%, #2e7bff 100%)"


def _config() -> dict:
    return {
        "provider": os.environ.get("EMAIL_PROVIDER", "console").strip().lower(),
        "from": os.environ.get("EMAIL_FROM", "Super AI <no-reply@super-ai.amrahaz.me>"),
        "api_key": os.environ.get("RESEND_API_KEY", "").strip(),
    }


def _logo_url() -> str:
    base = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")
    return f"{base.rstrip('/')}/app-logo.svg"


def render_template(
    *,
    title: str,
    body: str,
    button_url: str,
    button_label: str,
) -> str:
    """Render a branded, responsive HTML email with the Super AI logo."""
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f3f4f8;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;text-align:left;">
          <tr>
            <td align="center" style="padding:36px 24px 8px;">
              <img src="{_logo_url()}" alt="Super AI" width="64" height="64" style="display:block;width:64px;height:64px;border:0;outline:none;"/>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.02em;">
              {APP_NAME}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:600;color:#111827;">
              {title}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#4b5563;">
              {body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 28px;">
              <a href="{button_url}" target="_blank" style="display:inline-block;background:{GRADIENT};color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;padding:14px 28px;border-radius:12px;">
                {button_label}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;border-top:1px solid #f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">
              If the button above does not work, copy and paste this link into your browser:
              <span style="word-break:break-all;color:#6b7280;">{button_url}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">
              &copy; {APP_NAME} &mdash; You received this email because this account was registered on {APP_NAME}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def verification_email_html(verify_url: str) -> str:
    """Build the email used to confirm an account's email address."""
    body = (
        "<p style='margin:0 0 16px;'>Thanks for signing up for Super AI! "
        "Please confirm your email address to activate your account.</p>"
        "<p style='margin:0;color:#6b7280;font-size:13px;'>"
        "This confirmation link expires in 30 minutes. If you didn't create this "
        "account, you can safely ignore this email.</p>"
    )
    return render_template(
        title="Confirm your email",
        body=body,
        button_url=verify_url,
        button_label="Confirm my email",
    )


def password_reset_email_html(reset_url: str, expiry_minutes: int = 30) -> str:
    """Build the email that hands out a password reset link."""
    body = (
        "<p style='margin:0 0 16px;'>We received a request to reset the password "
        "for your Super AI account. Use the button below to choose a new one.</p>"
        "<p style='margin:0;color:#6b7280;font-size:13px;'>"
        f"This link expires in {expiry_minutes} minutes. If you did not request a "
        "password reset, you can safely ignore this email &mdash; your current "
        "password will not change.</p>"
    )
    return render_template(
        title="Reset your password",
        body=body,
        button_url=reset_url,
        button_label="Reset my password",
    )


def _plain_text(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def _send_via_resend(to: str, subject: str, html: str) -> None:
    config = _config()
    if not config["api_key"]:
        raise RuntimeError(
            "RESEND_API_KEY is not configured. Set RESEND_API_KEY in the "
            "environment, or use EMAIL_PROVIDER=console during development."
        )
    payload = json.dumps(
        {
            "from": config["from"],
            "to": [to],
            "subject": subject,
            "html": html,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status >= 400:
                detail = response.read().decode("utf-8", "replace")
                raise RuntimeError(
                    f"Resend request failed ({response.status}): {detail}"
                )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Resend request failed ({exc.code}): {detail}") from exc


def _send_via_smtp(to: str, subject: str, html: str) -> None:
    config = _config()
    host = os.environ.get("SMTP_HOST")
    if not host:
        raise RuntimeError("SMTP_HOST is not configured for the 'smtp' provider.")
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = config["from"]
    message["To"] = to
    message.set_content(_plain_text(html))
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        if username:
            server.login(username, password)
        server.send_message(message)


def _send_via_console(to: str, subject: str, html: str) -> None:
    links = re.findall(r'href="([^"]+)"', html)
    print(f"[email] To: {to}")
    print(f"[email] Subject: {subject}")
    if links:
        print(f"[email] Links: {' | '.join(links)}")
    print("[email] (EMAIL_PROVIDER is 'console' - no email was delivered.)")


def send_email(to: str, subject: str, html: str) -> None:
    """Dispatch an email to the configured provider."""
    provider = _config()["provider"]
    if provider == "resend":
        _send_via_resend(to, subject, html)
    elif provider == "smtp":
        _send_via_smtp(to, subject, html)
    else:
        _send_via_console(to, subject, html)


def send_verification_email(to: str, verify_url: str) -> None:
    send_email(to, "Confirm your Super AI email", verification_email_html(verify_url))


def send_password_reset_email(
    to: str, reset_url: str, expiry_minutes: int = 30
) -> None:
    send_email(
        to,
        "Reset your Super AI password",
        password_reset_email_html(reset_url, expiry_minutes),
    )
