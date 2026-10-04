-- Run as a PostgreSQL superuser or a role with CREATEROLE and CREATEDB.
CREATE ROLE unitycatalog LOGIN PASSWORD 'change-me';
CREATE DATABASE unitycatalog OWNER unitycatalog;
