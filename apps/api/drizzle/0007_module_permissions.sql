INSERT INTO permissions (code, resource, action, description)
VALUES ('followups.read', 'followups', 'read', 'عرض المتابعات')
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id)
SELECT up.user_id, fp.id
FROM user_permissions up
JOIN permissions cp ON cp.id = up.permission_id AND cp.code = 'customers.read'
JOIN permissions fp ON fp.code = 'followups.read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, fp.id
FROM role_permissions rp
JOIN permissions cp ON cp.id = rp.permission_id AND cp.code = 'customers.read'
JOIN permissions fp ON fp.code = 'followups.read'
ON CONFLICT DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id)
SELECT up.user_id, pp.id
FROM user_permissions up
JOIN permissions ip ON ip.id = up.permission_id AND ip.code = 'inventory.read'
JOIN permissions pp ON pp.code = 'purchases.read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, pp.id
FROM role_permissions rp
JOIN permissions ip ON ip.id = rp.permission_id AND ip.code = 'inventory.read'
JOIN permissions pp ON pp.code = 'purchases.read'
ON CONFLICT DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id)
SELECT up.user_id, pp.id
FROM user_permissions up
JOIN permissions ip ON ip.id = up.permission_id AND ip.code = 'inventory.adjust'
JOIN permissions pp ON pp.code = 'purchases.write'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, pp.id
FROM role_permissions rp
JOIN permissions ip ON ip.id = rp.permission_id AND ip.code = 'inventory.adjust'
JOIN permissions pp ON pp.code = 'purchases.write'
ON CONFLICT DO NOTHING;
