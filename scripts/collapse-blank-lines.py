from pathlib import Path
import re

def collapse(file_path):
    text = file_path.read_text()
    new_text = re.sub(r'(?:\r?\n){3,}', '\n\n', text)
    if new_text != text:
        file_path.write_text(new_text)

tests_dir = Path('tests')
for test_file in tests_dir.glob('test-*.js'):
    collapse(test_file)
