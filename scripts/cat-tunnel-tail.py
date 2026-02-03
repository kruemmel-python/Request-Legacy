from pathlib import Path

path = Path('tests/test-tunnel.js')
lines = path.read_text().splitlines()
for i in range(len(lines) - 60, len(lines)):
    if i >= 0:
        print(f"{i+1:03}: {lines[i]}")
