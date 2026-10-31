
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

def calculate_rest_day_payment(
    monthly_salary: float,
    rest_days_worked: int
) -> dict:
    """Calculate illustrative minimum pay in lieu of eligible rest days worked."""

    if isinstance(monthly_salary, bool):
        return {"success": False, "error": "Invalid salary"}
    try:
        salary = Decimal(str(monthly_salary))
    except (InvalidOperation, TypeError, ValueError):
        return {"success": False, "error": "Invalid salary"}
    if not salary.is_finite() or salary <= 0:
        return {"success": False, "error": "Invalid salary"}
    if isinstance(rest_days_worked, bool) or not isinstance(rest_days_worked, int) or not 0 <= rest_days_worked <= 31:
        return {"success": False, "error": "Invalid day count"}

    daily_rate = salary / Decimal("26")

    additional = (
        daily_rate * rest_days_worked
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "success": True,
        "additional_payment": str(additional),
        "total_including_salary": str(
            (salary + additional).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP
            )
        ),
        "warning": (
            "Calculation only. Check the mandatory "
            "monthly rest day and deferral rules separately."
        )
    }
