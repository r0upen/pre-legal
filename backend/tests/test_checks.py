"""Checks what code rejects in a value, and that real values, above all non-U.S. ones, pass."""

import pytest

from app.checks import address_problem, law_problem, percent_problem


@pytest.mark.parametrize(
    "address",
    [
        "200 Market St, San Francisco, CA 94105",
        "200 Market St, San Francisco CA 94105",
        "1 Main St, Dover, Delaware 19901",
        "1 Main St, Dover, DE 19901-1234",
        "1 Main St, Dover, DE 19901, USA",
        "5 Hudson Yards, New York, New York 10001",
        "1 Pine Rd, Charleston, West Virginia 25301",
        "9 Elm St, Washington, DC 20001",
        "Unit 2, APO, AE 09012",
        # Outside the US
        "10 Downing St, London SW1A 2AA, United Kingdom",
        "1 King St, Toronto, ON M5V 2T6, Canada",
        "8 Rue Royale, 75008 Paris, France",
        "1 George St, Perth, WA 6000, Australia",
        "Hauptstrasse 5, 10115 Berlin, Germany",
        "Hauptstrasse 5, Berlin 10115",
        "Rua Augusta 5, Lisboa 1000-001",
        "Hauptstrasse 5, Mainz 55116",
        "1 Collins St, Melbourne VIC 3000",
        # Not checkable, so left to the AI
        "200 Market St",
        "200 Market St 12",
        "1 Main St, Apt 12",
        "350 Fifth Ave, Fl 21",
        "10 Main St, Ct 5",
    ],
)
def test_real_addresses_pass(address):
    assert address_problem(address) is None


@pytest.mark.parametrize(
    ("address", "named"),
    [
        ("200 Market St, San Francisco, XZ 94105", '"XZ"'),
        ("200 Market St, San Francisco XZ 94105", '"XZ"'),
        ("1 Main St, Dover, DE 1990", '"1990"'),
        ("1 Main St, Dover, DE 199011", '"199011"'),
        ("1 Main St, Dover, Delaware 1990", '"1990"'),
        ("1 Main St, Dover, de 1990", '"1990"'),
        ("1 Main St, Dover, DE 19901-12", '"19901-12"'),
        ("1 Main St, Dover, Delwaare 19901", "Delaware"),
        ("1 Main St, Dover, Californa 94105, USA", "California"),
    ],
)
def test_bad_states_and_zip_codes_are_rejected(address, named):
    problem = address_problem(address)
    assert named in problem
    assert "outside the US" in problem  # the way out for a real address abroad


@pytest.mark.parametrize(
    "law",
    ["the State of Delaware", "State of New York", "the Commonwealth of Virginia", "the State of Israel", "England and Wales", "Delaware", "Agreed"],
)
def test_real_governing_laws_pass(law):
    assert law_problem(law) is None


@pytest.mark.parametrize(("law", "state"), [("the State of Delwaare", "Delaware"), ("the state of Califronia", "California"), ("Commonwealth of Virgina", "Virginia")])
def test_misspelled_states_in_governing_law_are_rejected(law, state):
    assert state in law_problem(law)


@pytest.mark.parametrize("uptime", ["99.9%", "100%", "0.5 %", "99.9 percent", "99-100%", "three nines", "Agreed"])
def test_real_uptimes_pass(uptime):
    assert percent_problem(uptime) is None


@pytest.mark.parametrize("uptime", ["101%", "100.1%", "0%", "-5%", "150 percent"])
def test_impossible_uptimes_are_rejected(uptime):
    assert percent_problem(uptime)


@pytest.mark.parametrize("address", ["1 St Georges Tce, Perth WA 6000", "Av. Constitucion 100, Monterrey, NL 64000"])
def test_a_non_us_address_with_no_country_is_asked_for_it(address):
    assert "include the country" in address_problem(address)
    assert address_problem(f"{address}, Elsewhere") is None
