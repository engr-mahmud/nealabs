-- Runs once when the database volume is created.
-- The app connects as a normal role so PostgreSQL Row Level Security applies.
-- Change the password in production (and in DATABASE_URL).
CREATE ROLE nealabs LOGIN PASSWORD 'change-me';
CREATE DATABASE nealabs OWNER nealabs;
