

import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import Config

BRAND_ORANGE = "#EE5A2E"
INK = "#202124"
MUTED = "#5f6368"
FOOTER_GREY = "#80868b"
# Served from the built SPA (frontend/public/brand -> /static/spa/brand). Mail
# clients load it from the public BASE_URL; where images are blocked or the
# URL is not public (local dev) the alt text "ChiefTalent" shows instead.
LOGO_URL = f"{Config.BASE_URL}/static/spa/brand/chieftalent-logo.png"

_RULES = [
    "Sit in a quiet room. Background voices can be detected and flagged.",
    "Use a stable internet connection.",
    "Sit against a clear, plain background.",
    "Make sure nobody else is in the room with you.",
    "Wear a plain formal shirt.",
    "Do not switch browser tabs during the interview. Each switch gives you a warning, and the interview stops after 3 warnings.",
    "Stay in full screen for the whole interview. Leaving full screen counts as a violation.",
    "Developer tools and their keyboard shortcuts are disabled during the interview.",
    "The entire session is recorded.",
    "You get 30 minutes once you start. The interview ends on its own when the time is up.",
]


def _first_name(full_name):
    parts = (full_name or "").split()
    return parts[0] if parts else ""


def _greeting_text(name):
    first = _first_name(name)
    return f"Hello {first}," if first else "Hello,"


def _greeting_html(name):
    first = _first_name(name)
    return f"Hello <strong>{first}</strong>," if first else "Hello,"


def _shell(inner_html):
    """White card on a light grey page, like the preview the HR approved."""
    return f"""<html><body style="margin:0;padding:0;background:#f6f6f6">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;padding:26px 30px">
<p style="margin:0 0 18px">
<img src="{LOGO_URL}" alt="ChiefTalent" height="34" style="height:34px;width:auto;border:0;display:block;font-weight:bold;font-size:14px;color:{INK}">
</p>
{inner_html}
<hr style="border:none;border-top:1px solid #f0f0f2;margin:18px 0 14px">
<p style="margin:0;font-size:12px;color:{FOOTER_GREY};line-height:1.5">This email was sent to you because you applied for a position with DotStark Technologies. If this was not you, ignore this email.</p>
</div>
</div>
</body></html>"""


def send_interview_email(to_email, candidate_name, role_title, interview_url):
    """Interview invitation: link + the interview hygiene rules.

    Sent when the ATS shortlists a CV, and when HR shortlists manually
    (the shortlist button or a review decision of Selected).
    """
    subject = f"Your interview link for {role_title}"
    rules_html = "".join(
        f'<li style="margin-bottom:7px;font-size:13.5px;line-height:1.5;color:{INK}">{r}</li>'
        for r in _RULES
    )
    rules_text = "\n".join(f"{i}. {r}" for i, r in enumerate(_RULES, 1))

    text = (
        f"{_greeting_text(candidate_name)}\n\n"
        f"Your profile has been shortlisted for the {role_title} position at DotStark "
        "Technologies. The next step is a short online interview that you take from your "
        "own computer, at a time that suits you.\n\n"
        f"Start your interview: {interview_url}\n\n"
        "This link is unique to you. Do not share it with anyone.\n\n"
        "Before you start, please follow these rules. The interview is monitored.\n"
        f"{rules_text}\n\n"
        "Some questions need your camera and microphone, so allow access when your "
        "browser asks. If the link does not work or you face any problem, reply to this "
        "email and we will help you.\n\n"
        "Best regards,\nHR Team\nDotStark Technologies"
    )

    inner = f"""
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">{_greeting_html(candidate_name)}</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">Your profile has been shortlisted for the <strong>{role_title}</strong> position at DotStark Technologies. The next step is a short online interview that you take from your own computer, at a time that suits you.</p>
<p style="margin:0 0 8px"><a href="{interview_url}" style="display:inline-block;padding:11px 22px;background:{BRAND_ORANGE};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px">Start your interview</a></p>
<p style="margin:8px 0 18px;font-size:12.5px;color:{MUTED};word-break:break-all">Or copy this link into your browser:<br>{interview_url}</p>
<p style="margin:0 0 14px;font-size:14px;color:{INK}">This link is unique to you. Do not share it with anyone.</p>
<div style="margin:0 0 16px;padding:16px 18px;background:#faf9f7;border:1px solid #efece7;border-radius:8px">
<p style="margin:0 0 10px;font-weight:bold;font-size:13.5px;color:{INK}">Before you start, please follow these rules. The interview is monitored.</p>
<ol style="margin:0;padding-left:20px">{rules_html}</ol>
</div>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">Some questions need your camera and microphone, so allow access when your browser asks. If the link does not work or you face any problem, reply to this email and we will help you.</p>
<p style="margin:0 0 12px;font-size:14px;color:{INK}">Best regards,<br>HR Team<br>DotStark Technologies</p>"""

    html = _shell(inner)
    return _deliver(to_email, subject, text, html)


def send_verification_email(to_email, candidate_name, code, ttl_minutes=10):
    """Verification code email: sent when the candidate requests the code
    on their interview link, to prove they own the resume email address."""
    subject = f"{code} is your verification code"

    text = (
        f"{_greeting_text(candidate_name)}\n\n"
        "Use this code to verify your email for your interview:\n\n"
        f"{code}\n\n"
        f"This code works for {ttl_minutes} minutes.\n\n"
        "Enter the code in your interview window to continue. Do not share this code with anyone.\n\n"
        "If you did not request this code, you can safely ignore this email.\n\n"
        "Best regards,\nHR Team\nDotStark Technologies"
    )

    inner = f"""
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">{_greeting_html(candidate_name)}</p>
<p style="margin:0 0 6px;font-size:14px;color:{INK}">Use this code to verify your email for your interview:</p>
<div style="text-align:center;margin:14px 0 18px">
<div style="font-size:34px;font-weight:bold;letter-spacing:10px;color:{INK}">{code}</div>
<div style="font-size:13px;color:{MUTED};margin-top:6px">This code works for {ttl_minutes} minutes.</div>
</div>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">Enter the code in your interview window to continue. Do not share this code with anyone.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:{INK}">If you did not request this code, you can safely ignore this email.</p>
<p style="margin:0 0 12px;font-size:14px;color:{INK}">Best regards,<br>HR Team<br>DotStark Technologies</p>"""

    html = _shell(inner)
    return _deliver(to_email, subject, text, html)


def send_email(to_email, subject, text, html):
    """Generic email send (SMTP or outbox fallback)."""
    return _deliver(to_email, subject, text, html)


def _deliver(to_email, subject, text, html):
    if not Config.SMTP_HOST:
        return _save_to_outbox(to_email, subject, text, html)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = Config.SMTP_FROM or Config.SMTP_USERNAME
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        if Config.SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(Config.SMTP_HOST, Config.SMTP_PORT, context=context, timeout=30) as server:
                if Config.SMTP_USERNAME:
                    server.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=30) as server:
                if Config.SMTP_USE_TLS:
                    server.starttls(context=ssl.create_default_context())
                if Config.SMTP_USERNAME:
                    server.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
                server.send_message(msg)
        return True, "sent via SMTP"
    except Exception as e:  # noqa: BLE001 - reported to caller, stored on candidate
        return False, f"SMTP error: {e}"


def _save_to_outbox(to_email, subject, text, html):
    """Dev fallback: persist the email so the demo works without SMTP."""
    Config.OUTBOX_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    safe_to = (to_email or "unknown").replace("@", "_at_")
    path = Config.OUTBOX_DIR / f"{stamp}_{safe_to}.html"
    path.write_text(
        f"<!-- TO: {to_email} | SUBJECT: {subject} -->\n{html}\n<!--\n{text}\n-->",
        encoding="utf-8",
    )
    return True, f"saved to outbox ({path.name})"
