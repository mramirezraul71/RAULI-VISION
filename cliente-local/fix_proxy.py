path = r'C:\ATLAS_PUSH\_external\RAULI-VISION\cliente-local\internal\api\proxy.go'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

count = 0
# Find all occurrences of Expires header followed by Content-Type for index.html serving
# and add CDN no-store headers
old = 'w.Header().Set("Expires", "0")\n\t\t\t\tw.Header().Set("Content-Type", "text/html; charset=utf-8")'
new = 'w.Header().Set("Expires", "0")\n\t\t\t\tw.Header().Set("Cloudflare-CDN-Cache-Control", "no-store")\n\t\t\t\tw.Header().Set("CDN-Cache-Control", "no-store")\n\t\t\t\tw.Header().Set("Content-Type", "text/html; charset=utf-8")'

if old in content:
    content = content.replace(old, new)
    count = content.count('Cloudflare-CDN-Cache-Control')
    print(f'OK: replaced {content.count(new)} occurrences, total CDN headers: {count}')
else:
    # Try with different tab depth
    old2 = 'w.Header().Set("Expires", "0")\n\t\t\t\t\tw.Header().Set("Content-Type", "text/html; charset=utf-8")'
    if old2 in content:
        print('Found with 5 tabs')
    else:
        print('NOT FOUND - showing context around Expires:')
        idx = content.find('Expires')
        print(repr(content[idx-10:idx+200]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
