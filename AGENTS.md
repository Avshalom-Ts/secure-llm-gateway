# Project Instructions

Use this repository as a starter. Replace the placeholders in `.doc/` and adjust or remove rules that do not fit the project.

## Security

- Never commit or expose secrets, credentials, private keys, or production data.
- Store local configuration in ignored environment files and document required variables in an example file.

## Project Documentation

- Keep the product definition, architecture, and glossary current as the project takes shape.
- Update database guidance when the data model or migration approach changes.
- Add a concise JSDoc block before every named function, exported handler, class constructor, and meaningful local helper. Document its purpose, parameters, return value, and thrown errors where relevant. Do not add repetitive comments to ordinary inline callbacks or trivial expressions.

## Engineering Standards

- Follow the relevant guidance in `.rule/`.
- Prefer small, focused changes with validation appropriate to their risk.
- Do not commit, merge, or publish without explicit approval.
