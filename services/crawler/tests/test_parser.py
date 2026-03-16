from app.extract.parser import clean_text, parse_html


HTML = """
<html lang="en">
  <head>
    <title>Sample Document</title>
    <meta name="description" content="Example summary">
    <meta name="keywords" content="python,search,engine">
  </head>
  <body>
    <h1>Sample Document</h1>
    <p>This is a searchable paragraph.</p>
    <a href="/next">Next page</a>
  </body>
</html>
"""


def test_clean_text_collapses_whitespace():
    assert clean_text(" a \n  b\tc ") == "a b c"


def test_parse_html_extracts_core_fields():
    parsed = parse_html("https://example.com/start", HTML)
    assert parsed.title == "Sample Document"
    assert parsed.meta_description == "Example summary"
    assert parsed.language == "en"
    assert "https://example.com/next" in parsed.links
    assert parsed.word_count > 0
    assert parsed.tags == ["python", "search", "engine"]

