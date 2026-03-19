import json, os, secrets, string, datetime

store_path = r'C:\ATLAS_PUSH\_external\RAULI-VISION\espejo\data\access-store.json'

with open(store_path, 'r', encoding='utf-8') as f:
    store = json.load(f)

now = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

new_users = [
    {
        "id": "usr_cami_001",
        "request_id": "req_cami_001",
        "name": "Cami",
        "email": "cami@rauli.local",
        "phone": "+5351440494",
        "role": "Usuario",
        "organization": "RAULI",
        "status": "active",
        "access_code": "CAMI2026HH",
        "code_sent": False,
        "created_at": "2026-01-01T10:00:00Z",
        "updated_at": now,
        "activated_at": "2026-01-01T10:00:00Z",
        "approved_by": "Owner"
    },
    {
        "id": "usr_raulitin_001",
        "request_id": "req_raulitin_001",
        "name": "Raulitin",
        "email": "raulitin@rauli.local",
        "phone": "+5356400834",
        "role": "Usuario",
        "organization": "RAULI",
        "status": "active",
        "access_code": "RLTN2026II",
        "code_sent": False,
        "created_at": "2026-01-01T10:00:00Z",
        "updated_at": now,
        "activated_at": "2026-01-01T10:00:00Z",
        "approved_by": "Owner"
    }
]

for u in new_users:
    # Check if already exists by phone
    exists = any(
        v.get('phone') == u['phone'] or v.get('name', '').lower() == u['name'].lower()
        for v in store['users'].values()
    )
    if exists:
        print(f"SKIP: {u['name']} already exists")
    else:
        store['users'][u['id']] = u
        print(f"ADDED: {u['name']} — code: {u['access_code']} — phone: {u['phone']}")

store['updated_at'] = now

with open(store_path, 'w', encoding='utf-8') as f:
    json.dump(store, f, ensure_ascii=False, indent=2)

print("Store saved OK")
print(f"Total users: {len(store['users'])}")
