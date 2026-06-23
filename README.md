# Cash Management

Sistema de gestión de cortes para el cobro de deudas municipales (Catastro Urbano, Catastro Rural, Agua Potable).

---

## Requisitos

| Herramienta | Versión |
|-------------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| PostgreSQL | >= 14 |
| PostgreSQL (SIIM) | Servidor remoto con BDD del SIIM |

---

## 1. Clonar el repositorio

```bash
git clone <url-del-repo> cash-management
cd cash-management
```

---

## 2. Base de datos

### 2.1. Crear la base de datos local

Conéctate a PostgreSQL y crea la base de datos:

```sql
CREATE DATABASE cash_management;
```

### 2.2. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env` con tus datos:

```env
# Conexión a la base de datos del sistema (PostgreSQL local)
DATABASE_URL="postgresql://postgres:tu_contraseña@localhost:5432/cash_management?schema=public"

# Conexión a la base de datos del SIIM (solo lectura)
SIIM_DATABASE_URL="postgresql://postgres:tu_contraseña@192.168.x.x:5432/SIIM_pruebafat"

# Puerto del servidor backend
PORT=3000

# Secreto JWT (mínimo 32 caracteres)
JWT_SECRET="AquíTuSecretoSuperSeguroDe32CaracteresO más"

# Módulos SIIM
MODULO_CATASTRO_URBANO=1
MODULO_CATASTRO_RURAL=2
MODULO_AGUA_POTABLE=3

NODE_ENV=development
```

> **Nota**: Si tu contraseña de PostgreSQL contiene el carácter `#`, reemplázalo por `%23` en la URL.

---

## 3. Backend

```bash
cd backend
npm install
```

### 3.1. Generar el cliente de Prisma y ejecutar migraciones

```bash
npx prisma generate
npx prisma migrate dev
```

### 3.2. Poblar la base de datos (usuario administrador por defecto)

```bash
npm run db:seed
```

Esto crea el usuario administrador inicial:

| Campo | Valor |
|-------|-------|
| Email | `admin@cash.com` |
| Contraseña | `Admin1234!` |
| Rol | `ADMIN` |

### 3.3. Iniciar el servidor en modo desarrollo

```bash
npm run dev
```

El backend se ejecutará en **http://localhost:3000**

### Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor con hot-reload |
| `npm run build` | Compila TypeScript a JavaScript |
| `npm start` | Inicia en producción (requiere `npm run build` primero) |
| `npm run db:studio` | Abre Prisma Studio para explorar la BDD |
| `npm run db:reset` | Resetea la BDD y ejecuta migraciones + seed |
| `npm run db:migrate` | Ejecuta migraciones pendientes |

---

## 4. Frontend

Abre una **nueva terminal** y ejecuta:

```bash
cd frontend
npm install
npm run dev
```

El frontend se ejecutará en **http://localhost:5173**

### Proxy de API

El frontend usa Vite y ya tiene configurado el proxy en `vite.config.ts` para redirigir las peticiones `/api/*` al backend en `http://localhost:3000`.

### Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo con HMR |
| `npm run build` | Compila para producción |
| `npm run preview` | Previsualiza el build de producción |
| `npm run lint` | Ejecuta el linter |

---

## 5. Acceder a la aplicación

1. Backend: **http://localhost:3000**
2. Frontend: **http://localhost:5173**
3. Health check del backend: **http://localhost:3000/api/health**
4. Prisma Studio (explorar BDD): `npm run db:studio` (desde `backend/`)

### Credenciales por defecto

| Email | Contraseña |
|-------|-----------|
| `admin@cash.com` | `Admin1234!` |

---

## 6. Estructura del proyecto

```
cash-management/
├── backend/                    # API REST con Express + Prisma
│   ├── prisma/
│   │   ├── migrations/         # Migraciones de base de datos
│   │   ├── schema.prisma       # Esquema de datos
│   │   └── seed.ts            # Población inicial
│   └── src/
│       ├── config/             # Validación de entorno
│       ├── lib/                # Clientes de BD (Prisma + pg)
│       ├── middlewares/        # Middlewares Express
│       ├── modules/            # Módulos de la aplicación
│       │   ├── auth/           # Autenticación (JWT)
│       │   ├── admin/          # CRUD de usuarios
│       │   └── cut/            # Lógica de cortes y exportación
│       ├── services/           # Servicios externos (SIIM)
│       └── types/              # Tipos compartidos
│
├── frontend/                   # SPA con React + Vite
│   └── src/
│       ├── api/                # Cliente Axios y utilidades
│       ├── components/         # Componentes reutilizables
│       ├── features/           # Módulos por funcionalidad
│       │   ├── auth/
│       │   ├── admin/
│       │   ├── cut/
│       │   └── dashboard/
│       ├── layouts/            # Layouts de navegación
│       ├── store/              # Estado global (Zustand)
│       └── helpers/            # Utilidades
│
└── README.md
```
