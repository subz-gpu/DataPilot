import pytest

from profiler import format_profile_for_prompt, profile_dataset
from sandbox import sandbox_ready

pytestmark = pytest.mark.skipif(
    not sandbox_ready(), reason="Docker or sandbox image missing"
)


@pytest.fixture
def messy_csv(tmp_path):
    p = tmp_path / "messy.csv"
    p.write_text(
        "name,age,joined,city\n"
        "Asha,30,2024-01-05,Pune\n"
        "Ben,,2024-02-11,Delhi\n"
        "Chitra,41,2024-03-20,\n"
        "Dev,25,2024-04-02,Pune\n"
    )
    return p


def test_profile_basic_shape_and_nulls(messy_csv):
    prof = profile_dataset(messy_csv)
    assert prof["rows"] == 4
    assert prof["columns"] == 4
    fields = {f["name"]: f for f in prof["fields"]}
    assert fields["age"]["nulls"] == 1
    assert fields["city"]["nulls"] == 1
    assert "stats" in fields["age"]


def test_profile_detects_text_dates(messy_csv):
    prof = profile_dataset(messy_csv)
    fields = {f["name"]: f for f in prof["fields"]}
    assert fields["joined"].get("likely_datetime") is True


def test_profile_text_is_prompt_friendly(messy_csv):
    text = format_profile_for_prompt(profile_dataset(messy_csv))
    assert "Rows: 4" in text and "age" in text


def test_profile_is_strict_json_with_missing_values(messy_csv):
    import json

    prof = profile_dataset(messy_csv)
    json.dumps(prof, allow_nan=False)  # NaN anywhere would raise
    assert any(row["age"] is None for row in prof["head"])
