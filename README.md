# Real-Time Data Sync POC - Backend API

NestJS backend with Fastify adapter, Prisma ORM, Auth0 authentication, and Socket.IO for real-time updates.

## Tech Stack

- **Framework**: NestJS v11 with Fastify adapter
- **Language**: TypeScript (strict mode)
- **ORM**: Prisma v7 with PostgreSQL adapter
- **Database**: PostgreSQL 16 (WAL logical replication enabled)
- **Authentication**: Auth0 (JWT-based with HTTP-only cookies)
- **Real-Time**: Socket.IO
- **Logger**: Pino (via Fastify)

## Project Structure

```
server/
├── src/
│   ├── auth/           # Auth0 authentication module (Phase 3)
│   ├── common/         # Shared utilities
│   │   ├── filters/    # Global exception filter
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── config/         # Configuration module
│   │   ├── configuration.ts
│   │   └── env.validation.ts
│   ├── pcr/            # PCR records module (Phase 8)
│   ├── rbac/           # Role-based access control (Phase 4)
│   ├── realtime/       # Socket.IO & WAL bridge (Phase 5-6)
│   ├── users/          # Users module (Phase 8)
│   ├── app.module.ts   # Root application module
│   └── main.ts         # Application entry point
├── prisma/
│   ├── schema.prisma   # Database schema
│   ├── seed.ts         # Database seeding script
│   └── migrations/     # Database migrations
└── test/               # E2E tests
```

## Environment Variables

Required variables (see `.env` in server directory):

```env
# Database
DATABASE_URL=postgresql://poc_user:poc_password@localhost:5433/poc_db
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Migrations

```bash
npx prisma migrate dev
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Seed Database

```bash
npx prisma db seed
```

This creates:
- 2 tenants (Tenant A, Tenant B)
- 3 roles (ADMIN, MANAGER, VIEWER)
- 4 test users
- 5 sample PCR records

### 5. Start Development Server

```bash
npm run start:dev
```

Server runs at: `http://localhost:3000`

## Database Schema

### Models

- **Tenant**: Multi-tenant organization
- **User**: User with role-based permissions
- **Role**: Role definitions with permissions (JSON)
- **PcrRecord**: PCR test records for POC validation

## Test Users

Created by seed script:

| Email | Tenant | Role | Access |
|-------|---------|------|--------|
| admin@example.com | Tenant A | ADMIN | All tenants, full CRUD |
| manager-a@example.com | Tenant A | MANAGER | Tenant A only, full CRUD |
| manager-b@example.com | Tenant B | MANAGER | Tenant B only, full CRUD |
| viewer-a@example.com | Tenant A | VIEWER | Tenant A only, read-only |

## Scripts

```bash
# Development
npm run start:dev      # Start with hot reload
npm run build          # Build for production

# Database
npx prisma studio      # Open Prisma Studio (GUI)
npx prisma migrate dev # Create and apply migration
npx prisma generate    # Generate Prisma Client
npx prisma db seed     # Run seed script

# Code Quality
npm run lint           # Run ESLint
npm run format         # Format code
npm run test           # Run tests
```

## Next Steps

- **Phase 3**: Implement Auth0 authentication
- **Phase 4**: Implement RBAC guards and services
- **Phase 5**: Implement WAL bridge for real-time events
- **Phase 6**: Implement Socket.IO gateway and subscriptions
- **Phase 7**: Implement subscription invalidation
- **Phase 8**: Implement Users and PCR modules

## License

MIT
