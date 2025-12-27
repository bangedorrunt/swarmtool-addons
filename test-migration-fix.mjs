// Migration fix verification test
// Memory Lane now calls swarmMail.runMigrations() before ensureSchema()
// This should fix "no such table: cells" errors by ensuring hive tables exist
