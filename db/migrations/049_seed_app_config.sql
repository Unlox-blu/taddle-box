INSERT INTO app_config (latest_version, minimum_version, store_url)
VALUES ('1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=com.taddlebox.app')
ON CONFLICT DO NOTHING;
