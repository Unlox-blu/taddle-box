const { Client } = require('pg');
const client = new Client('postgresql://neondb_owner:npg_e67TkoahwlXz@ep-lingering-dawn-aonvhquy.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');
client.connect()
  .then(() => client.query("INSERT INTO _migrations (filename) VALUES ('066_cleanup_bookmarks.sql') ON CONFLICT (filename) DO NOTHING"))
  .then(res => { console.log('Fixed migration tracking'); client.end(); })
  .catch(err => { console.error(err); client.end(); });
