from agent import extract_code


def test_extracts_fenced_python():
    reply = "Here you go:\n```python\nprint('hi')\n```\nDone."
    assert extract_code(reply) == "print('hi')"


def test_extracts_unlabeled_fence():
    assert extract_code("```\nx = 1\n```") == "x = 1"


def test_returns_plain_text_when_no_fence():
    assert extract_code("  print(1)  ") == "print(1)"
