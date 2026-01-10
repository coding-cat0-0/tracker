from celery import shared_task
from services import send_invitation_email

@shared_task(bind=True, autoretry_for=(Exception,),
             retry_kwargs={"max_retries": 3, "countdown": 10})
def send_invitation_email_task(self, to_email: str, invite_link: str):
    send_invitation_email(to_email, invite_link)
