from pathlib import Path

def print_range(path, start, end):
    for i, line in enumerate(Path(path).read_text().splitlines(), 1):
        if start <= i <= end:
            print(f"{i:03}: {line}")

print_range('tests/test-form-data.js', 100, 140)
