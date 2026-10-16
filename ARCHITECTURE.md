# Project structure

```text
backend/app/
  domain/          # entities and business rules
  application/     # use cases, ports, errors
  infrastructure/  # AI, PDF and PostgreSQL adapters
  presentation/    # HTTP entrypoint and future route modules
frontend/src/
  core/            # shared configuration
  features/        # independently growing product modules
infra/             # Docker Compose
```

Dependencies point inward: `presentation -> application -> domain`; infrastructure implements ports. Add a feature under `frontend/src/features` and its corresponding backend use case/adapter rather than expanding a global file.
