
from datetime import date, datetime, timedelta, timezone

def check_salary_deadline(
    salary_period_end: str,
    payment_date: str = "",
    as_of_date: str = ""
) -> dict:
    """Check an MDW salary deadline using confirmed ISO dates.

    For paid salary provide payment_date. For unpaid salary leave it empty;
    as_of_date is optional and defaults to today's date in Singapore. Never
    invent a payment date or salary-period end. This is a date calculation,
    not a determination of a legal complaint or employment dispute.
    """

    try:
        end_date = date.fromisoformat(salary_period_end)
        paid_date = date.fromisoformat(payment_date) if payment_date else None
        if payment_date is None or as_of_date is None:
            raise ValueError("Use empty strings for omitted dates.")
        reference = paid_date or (
            date.fromisoformat(as_of_date) if as_of_date
            else datetime.now(timezone(timedelta(hours=8))).date()
        )
    except (TypeError, ValueError):
        return {
            "success": False,
            "error": "Use valid YYYY-MM-DD dates; omit unpaid payment_date."
        }

    if paid_date is None and reference < end_date:
        return {"success": False, "error": "The unpaid salary period has not ended as of that date."}
    deadline = end_date + timedelta(days=7)
    days_late = max(0, (reference - deadline).days)
    if paid_date is not None:
        status = "after_deadline" if days_late else "within_deadline"
    elif reference > deadline:
        status = "unpaid_after_deadline"
    elif reference == deadline:
        status = "unpaid_due_today"
    else:
        status = "unpaid_before_deadline"

    return {
        "success": True,
        "salary_period_end": end_date.isoformat(),
        "deadline": deadline.isoformat(),
        "payment_date": paid_date.isoformat() if paid_date else "",
        "as_of_date": reference.isoformat(),
        "days_after_deadline": days_late,
        "status": status,
        "source_url": (
            "https://www.mom.gov.sg/passes-and-permits/"
            "work-permit-for-foreign-domestic-worker/"
            "employers-guide/salary-guidelines"
        )
    }
