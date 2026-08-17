# Testing Rules

- Test behavior rather than implementation details.
- Keep tests deterministic, isolated, and independent of execution order.
- Prefer fast unit tests, add integration tests where boundaries matter, and use end-to-end tests for critical journeys.
- New features should cover happy and failure paths; bug fixes should add a regression test when practical.
- Use minimal fixtures and never include real credentials in test data.
