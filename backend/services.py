import os
import smtplib
from email.mime.text import MIMEText

def send_invitation_email(to_email: str, invite_link: str):
    sender_email = os.getenv("SMTP_EMAIL")
    password = os.getenv("SMTP_PASSWORD")

    msg = MIMEText(
        f"You have been invited.\n\nClick here to accept:\n{invite_link}"
    )
    msg["Subject"] = "You're invited"
    msg["From"] = sender_email
    msg["To"] = to_email

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(sender_email, password)
        server.send_message(msg)
