"""Sandbox tests. Require Docker and the built image (scripts/build_sandbox.sh)."""
import pytest
import pandas as pd
from sandbox import run_code, sandbox_ready

pytestmark = pytest.mark.skipif(
    not sandbox_ready(),
    reason="Docker or sandbox image missing - run scripts/build_sandbox.sh first",
)


@pytest.fixture
def csv_file(tmp_path):
    p = tmp_path / "people.csv"
    p.write_text("name,age\nAsha,30\nBen,25\nChitra,41\n")
    return p


def test_runs_simple_code():
    r = run_code("print(2 + 2)")
    assert r.success
    assert r.stdout.strip() == "4"


def test_reads_dataset(csv_file):
    code = "import os, pandas as pd\ndf = pd.read_csv(os.environ['DATASET_PATH'])\nprint(df.shape)"
    r = run_code(code, csv_file)
    assert r.success, r.stderr
    assert "(3, 2)" in r.stdout

def test_reads_parquet_dataset(tmp_path):
    parquet_file = tmp_path / "people.parquet"

    df = pd.DataFrame({
        "name": ["Asha", "Ben", "Chitra"],
        "age": [30, 25, 41],
    })

    df.to_parquet(parquet_file, index=False)

    r = run_code(
        "print(df.shape)\nprint(df['name'].tolist())",
        parquet_file,
    )

    assert r.success, r.stderr
    assert "(3, 2)" in r.stdout
    assert "Asha" in r.stdout
    assert "Chitra" in r.stdout


def test_captures_python_error():
    r = run_code("raise ValueError('boom')")
    assert not r.success
    assert "ValueError" in r.stderr and "boom" in r.stderr


def test_timeout_kills_infinite_loop():
    r = run_code("while True:\n    pass", timeout_s=5)
    assert r.timed_out
    assert not r.success


def test_network_is_blocked():
    code = "import urllib.request\nurllib.request.urlopen('http://example.com', timeout=5)"
    r = run_code(code)
    assert not r.success


def test_dataset_is_read_only(csv_file):
    code = "import os\nopen(os.environ['DATASET_PATH'], 'a').write('hacked')"
    r = run_code(code, csv_file)
    assert not r.success
    assert csv_file.read_text().count("hacked") == 0


def test_cannot_write_outside_outputs():
    r = run_code("open('/work/hack.txt', 'w').write('x')")
    assert not r.success


def test_saves_chart_to_output_dir(csv_file):
    code = (
        "import os, pandas as pd, matplotlib.pyplot as plt\n"
        "df = pd.read_csv(os.environ['DATASET_PATH'])\n"
        "df.plot(x='name', y='age', kind='bar')\n"
        "plt.savefig(os.path.join(os.environ['OUTPUT_DIR'], 'ages.png'))\n"
    )
    r = run_code(code, csv_file)
    assert r.success, r.stderr
    assert "ages.png" in r.files


def test_memory_limit_is_enforced():
    r = run_code("x = bytearray(1024 * 1024 * 1024)\nprint(len(x))", memory="128m")
    assert not r.success
