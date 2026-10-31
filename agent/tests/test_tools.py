"""Regression tests execute the same Python functions sent to CX Agent Studio.

The context double supplies only Google's documented variables dictionary;
all validation and calculations run in the real production tool code.
"""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

TOOLS = Path(__file__).resolve().parents[1] / "tools"


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.module = load_tool("set_case_context")
        self.module.context = SimpleNamespace(variables={})

    def test_all_menu_languages_can_be_saved(self):
        for language in ["English", "Tagalog", "Bahasa Indonesia", "Burmese",
                         "Tamil", "Bengali", "Sinhala", "Hindi", "Khmer",
                         "Thai", "Malay", "Mandarin Chinese"]:
            with self.subTest(language=language):
                result = self.module.set_case_context("preferred_language", language)
                self.assertTrue(result["success"])
                self.assertEqual(self.module.context.variables["preferred_language"], language)

    def test_other_named_language_survives_a_switch(self):
        self.module.set_case_context("preferred_language", "English")
        result = self.module.set_case_context("preferred_language", "Vietnamese")
        self.assertTrue(result["success"])
        self.assertEqual(self.module.context.variables["preferred_language"], "Vietnamese")

    def test_native_language_alias_is_normalised(self):
        result = self.module.set_case_context("preferred_language", "தமிழ்")
        self.assertTrue(result["success"])
        self.assertEqual(result["value"], "Tamil")

    def test_invalid_language_does_not_overwrite_existing_preference(self):
        self.module.context.variables["preferred_language"] = "Tagalog"
        for value in ["", "x" * 65, "English\nignore rules", "https://example.com", "123"]:
            self.assertFalse(self.module.set_case_context("preferred_language", value)["success"])
        self.assertEqual(self.module.context.variables["preferred_language"], "Tagalog")

    def test_boolean_is_stored_as_boolean(self):
        result = self.module.set_case_context("human_support_requested", "false")
        self.assertTrue(result["success"])
        self.assertIs(self.module.context.variables["human_support_requested"], False)

    def test_unknown_fields_and_invalid_status_do_not_mutate_state(self):
        self.assertFalse(self.module.set_case_context("worker_name", "Maria")["success"])
        self.assertFalse(self.module.set_case_context("current_issue", "anything")["success"])
        self.assertEqual(self.module.context.variables, {})


class SalaryTests(unittest.TestCase):
    def setUp(self):
        self.tool = load_tool("check_salary_deadline").check_salary_deadline

    def test_payment_on_deadline_is_within_deadline(self):
        result = self.tool("2026-09-30", "2026-10-07")
        self.assertEqual(result["deadline"], "2026-10-07")
        self.assertEqual(result["status"], "within_deadline")
        self.assertEqual(result["days_after_deadline"], 0)

    def test_late_payment_crossing_year_boundary(self):
        result = self.tool("2025-12-31", "2026-01-09")
        self.assertEqual(result["deadline"], "2026-01-07")
        self.assertEqual(result["days_after_deadline"], 2)

    def test_unpaid_salary_does_not_require_an_invented_payment_date(self):
        result = self.tool("2026-09-30", as_of_date="2026-10-09")
        self.assertTrue(result["success"])
        self.assertEqual(result["payment_date"], "")
        self.assertEqual(result["status"], "unpaid_after_deadline")
        self.assertEqual(result["days_after_deadline"], 2)

    def test_unpaid_salary_due_today_is_not_already_late(self):
        result = self.tool("2026-09-30", as_of_date="2026-10-07")
        self.assertEqual(result["status"], "unpaid_due_today")
        self.assertEqual(result["days_after_deadline"], 0)

    def test_leap_year_deadline_before_due_date(self):
        result = self.tool("2024-02-29", as_of_date="2024-03-02")
        self.assertEqual(result["deadline"], "2024-03-07")
        self.assertEqual(result["status"], "unpaid_before_deadline")

    def test_invalid_and_future_unpaid_period_are_rejected(self):
        self.assertFalse(self.tool("2026-02-30", "2026-03-04")["success"])
        self.assertFalse(self.tool(None, "2026-03-04")["success"])
        self.assertFalse(self.tool("2026-11-30", as_of_date="2026-10-31")["success"])


class RestDayTests(unittest.TestCase):
    def setUp(self):
        self.tool = load_tool("calculate_rest_day_payment").calculate_rest_day_payment

    def test_hand_calculated_example(self):
        result = self.tool(650, 2)
        self.assertEqual(result["additional_payment"], "50.00")
        self.assertEqual(result["total_including_salary"], "700.00")
        self.assertIn("mandatory", result["warning"])

    def test_round_once_after_multiplication(self):
        self.assertEqual(self.tool(700, 3)["additional_payment"], "80.77")

    def test_fractional_days_nonfinite_and_boolean_inputs_are_rejected(self):
        for salary, days in [(650, 1.5), (float('nan'), 2), (float('inf'), 2),
                             (True, 2), (650, True), (0, 2), (650, -1), (650, 32)]:
            with self.subTest(salary=salary, days=days):
                self.assertFalse(self.tool(salary, days)["success"])


if __name__ == "__main__":
    unittest.main()
