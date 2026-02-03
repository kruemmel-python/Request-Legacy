from pathlib import Path

path = Path('request.js')
lines = path.read_text().splitlines()
for i in range(len(lines) - 40, len(lines)):
    if i >= 0:
        print(f"{i+1:04}: {lines[i]}")
