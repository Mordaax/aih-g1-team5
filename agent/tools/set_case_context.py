import unicodedata
def set_case_context(variable_name: str, new_value: str) -> dict:
    """
    Update an approved MDW Compass session variable.

    Does not store names, addresses or detailed
    abuse allegations.
    """

    allowed_values = {
        "current_issue": [
            "none",
            "salary",
            "welfare",
            "mistreatment",
            "human_support"
        ],

        "pending_issue": [
            "none",
            "salary",
            "welfare",
            "mistreatment",
            "human_support"
        ],

        "welfare_topic": [
            "none",
            "rest_days",
            "accommodation",
            "food",
            "medical_care",
            "emotional_wellbeing",
            "workplace_safety",
            "adjustment",
            "family_communication"
        ],

        "salary_finding": [
            "not_assessed",
            "needs_information",
            "timeline_explained",
            "referred_to_human"
        ],

        "welfare_finding": [
            "not_assessed",
            "needs_information",
            "guidance_explained",
            "referred_to_human"
        ],

        "support_organisation": [
            "none",
            "MOM",
            "HOME",
            "CDE",
            "Police",
            "FAST",
            "other"
        ]
    }

    if not isinstance(variable_name, str) or not isinstance(new_value, str):
        return {"success": False, "error": "Use a text field name and value."}

    # Accept explicit short language names, including the menu's Other choice.
    if variable_name == "preferred_language":
        aliases = {
            "filipino": "Tagalog", "pilipino": "Tagalog", "tagalog": "Tagalog",
            "english": "English", "indonesian": "Bahasa Indonesia",
            "bahasa indonesia": "Bahasa Indonesia", "bahasa": "Bahasa Indonesia",
            "myanmar": "Burmese", "burmese": "Burmese", "မြန်မာဘာသာ": "Burmese",
            "tamil": "Tamil", "தமிழ்": "Tamil", "bangla": "Bengali",
            "bengali": "Bengali", "বাংলা": "Bengali", "sinhala": "Sinhala",
            "sinhalese": "Sinhala", "සිංහල": "Sinhala", "hindi": "Hindi",
            "हिन्दी": "Hindi", "khmer": "Khmer", "cambodian": "Khmer",
            "ភាសាខ្មែរ": "Khmer", "thai": "Thai", "ภาษาไทย": "Thai",
            "malay": "Malay", "bahasa melayu": "Malay",
            "mandarin": "Mandarin Chinese", "mandarin chinese": "Mandarin Chinese",
            "中文": "Mandarin Chinese", "普通话": "Mandarin Chinese",
        }
        if any(unicodedata.category(c).startswith("C") for c in new_value):
            return {"success": False, "error": "Use a short language name."}
        value = " ".join(new_value.strip().split())
        if value != "not_selected" and (
            not 2 <= len(value) <= 64
            or not any(c.isalpha() for c in value)
            or not all(unicodedata.category(c)[0] in "LM" or c in " -'’" for c in value)
        ):
            return {"success": False, "error": "Use a short language name."}
        value = aliases.get(value.casefold(), value)
        context.variables[variable_name] = value
        return {"success": True, "variable": variable_name, "value": value}

    # The schema takes text; the stored session value is a real Boolean.
    if variable_name == "human_support_requested":
        value = new_value.strip().lower()

        if value not in ["true", "false"]:
            return {
                "success": False,
                "error": "Value must be true or false."
            }

        context.variables[variable_name] = (value == "true")

        return {
            "success": True,
            "variable": variable_name,
            "value": context.variables[variable_name]
        }

    # Prevent updates to unknown variables.
    if variable_name not in allowed_values:
        return {
            "success": False,
            "error": "Unknown session variable."
        }

    # Prevent unexpected values being stored.
    if new_value not in allowed_values[variable_name]:
        return {
            "success": False,
            "error": "Invalid value for this variable."
        }

    # Update the session variable.
    context.variables[variable_name] = new_value

    return {
        "success": True,
        "variable": variable_name,
        "value": new_value
    }
