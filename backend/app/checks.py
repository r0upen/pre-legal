"""What code can reliably check in a field's value. Each function returns a sentence for the user
when the value is wrong, or None. Anything uncertain passes and is left to the AI. A non-U.S. address
ending in its country passes; one with no country can look like a bad U.S. address, such as "Perth
WA 6000", and is then refused with a request to add the country."""

import re
from calendar import month_name
from difflib import get_close_matches

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "DC": "District of Columbia", "PR": "Puerto Rico", "GU": "Guam", "VI": "Virgin Islands",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
}  # fmt: skip
MILITARY = {"AA", "AE", "AP"}
_NAMES = {name.lower(): name for name in STATES.values()}

_US_SUFFIX = re.compile(r"[,\s]*\b(?:USA|U\.S\.A\.?|US|U\.S\.?|United States(?: of America)?)\.?$", re.I)
# The end of an address: a two-letter code, or a longer name after a comma, and then at least four
# digits. Fewer are not a ZIP code gone wrong but a floor or a unit, as in "Fl 21".
_CODE_AND_DIGITS = re.compile(r"(,\s*|\s)([A-Za-z]{2})\.?,?\s+(\d{4}[\d-]*)$")
_NAME_AND_DIGITS = re.compile(r"(?:^|,)\s*([A-Za-z][A-Za-z. ]{3,}?)\s+(\d{4}[\d-]*)$")
_ZIP = re.compile(r"\d{5}(?:-\d{4})?")
_NOT_US_HINT = "If the address is outside the US, please include the country."
YEARS_PROBLEM = "The number of years must be a whole number from 1 to 10."


def _is_state(name: str) -> bool:
    return name.strip(" .").lower() in _NAMES


def _near_miss(name: str) -> str | None:
    """The state a misspelled name was probably meant to be. An exact name is not a near miss."""
    if _is_state(name):
        return None
    match = get_close_matches(name.strip(" .").lower(), _NAMES, n=1, cutoff=0.85)
    return _NAMES[match[0]] if match else None


def _zip_problem(digits: str) -> str | None:
    if _ZIP.fullmatch(digits):
        return None
    return f'The ZIP code "{digits}" in that address should have 5 digits, or 5 and 4. {_NOT_US_HINT}'


def address_problem(text: str) -> str | None:
    """Only an address ending in a state and digits can be checked. One ending in another country's
    name, or with no digits at the end, passes."""
    text = _US_SUFFIX.sub("", text)
    if code := _CODE_AND_DIGITS.search(text):
        separator, token, digits = code.groups()
        # "St 12" is a street and number: a code in lower case counts only after a comma.
        if token.isupper() or "," in separator:
            token = token.upper()
            if token in STATES or token in MILITARY:
                return _zip_problem(digits)
            if _ZIP.fullmatch(digits):
                return f'"{token}" in that address is not a US state. {_NOT_US_HINT}'
            return None
    if named := _NAME_AND_DIGITS.search(text):
        name, digits = named.groups()
        # The second test is a city and state with no comma between them.
        if _is_state(name) or any(name.lower().endswith(f" {state}") for state in _NAMES):
            return _zip_problem(digits)
        if state := _near_miss(name):
            return f'"{name}" in that address is not a US state. Did you mean {state}? {_NOT_US_HINT}'
    return None


def law_problem(text: str) -> str | None:
    """Only a close misspelling can be caught: "the State of" is also the name of real countries."""
    match = re.fullmatch(r"(?:the\s+)?(?:state|commonwealth)\s+of\s+(.+)", text, re.I)
    if match and (state := _near_miss(match[1])):
        return f'"{match[1]}" is not a US state. Did you mean {state}?'
    return None


def percent_problem(text: str) -> str | None:
    """Text with no percentage in it passes."""
    for number in re.findall(r"(?<![\d.])(-?\d+(?:\.\d+)?)\s*(?:%|percent)", text, re.I):
        if not 0 < float(number) <= 100:
            return "Uptime must be above 0% and at most 100%."
    return None


def date_problem(value: str) -> str:
    """Only called with a value that is not a real date. In the right format it does not exist;
    otherwise the model could not resolve it, which says nothing about the user's date."""
    parts = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", value)
    if not parts:
        return "I need the full date for that, with the month, day and year."
    if 1 <= int(parts[2]) <= 12:
        return f"{month_name[int(parts[2])]} {int(parts[3])}, {parts[1]} is not a real date."
    return "That is not a real calendar date."

