UPDATE profiles SET role = 'owner', status = 'active' WHERE status = 'pending';
UPDATE tenants SET status = 'active' WHERE status = 'pending';
