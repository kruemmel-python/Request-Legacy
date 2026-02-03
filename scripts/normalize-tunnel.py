from pathlib import Path

path = Path('tests/test-tunnel.js')
text = path.read_text()

needle = "else {"
idx = text.find(needle)
if idx == -1:
    raise SystemExit("could not find else block")

brace = 0
start = idx + len(needle)
end = start
in_string = False
escape = False
for i in range(start, len(text)):
    ch = text[i]
    if ch == '"' and not escape:
        in_string = not in_string
    if ch == '\\\\':
        escape = not escape
    else:
        escape = False
    if not in_string:
        if ch == '{':
            brace += 1
        elif ch == '}':
            if brace == 0:
                end = i
                break
            brace -= 1

old_body = text[start:end].strip()

def dedent(s):
    lines = s.splitlines()
    min_indent = min(
        (len(line) - len(line.lstrip(' ')) for line in lines if line.strip()),
        default=0
    )
    return '\n'.join(line[min_indent:] for line in lines)

new_block = f"""if (!tlsSupported) {{
  tape('tunnel tests skip (OpenSSL 3 rejects MD5 CA certificates)', function (t) {{
    t.comment('OpenSSL rejected the bundled CA because the digest is too weak.')
    t.comment('Please replace tests/ssl assets with stronger certificates to re-enable these tests.')
    t.end()
  }})
}} else {{
  runTunnelTests()
}}

function runTunnelTests () {{
{dedent(old_body)}
}}
"""

new_text = text[:text.find("if (!tlsSupported)")] + new_block
path.write_text(new_text)
