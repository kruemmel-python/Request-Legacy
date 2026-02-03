from pathlib import Path

path = Path('tests/test-tunnel.js')
for i, line in enumerate(path.read_text().splitlines(), 1):
    if i <= 160:
        print(f"{i:03}: {line}")
