# Database Rules

- Select and document a migration tool before introducing persistent data.
- Treat migrations as the source of truth for schema changes.
- Prefer additive, reversible changes and test migrations against representative data.
- Document local bootstrap and seed-data instructions when a database is added.
- Never include production data or credentials in repository scripts.
