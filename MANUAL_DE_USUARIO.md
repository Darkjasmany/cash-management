# Manual de Usuario — Cash Management

Sistema de gestión de cortes para generación de reportes de deuda municipal.

---

## Índice

1. [Inicio de sesión](#1-inicio-de-sesión)
2. [Barra de navegación](#2-barra-de-navegación)
3. [Menú lateral](#3-menú-lateral)
4. [Dashboard](#4-dashboard)
5. [Procesar corte](#5-procesar-corte)
6. [Historial de cortes](#6-historial-de-cortes)
7. [Gestión de usuarios (Administradores)](#7-gestión-de-usuarios-administradores)
8. [Cerrar sesión](#8-cerrar-sesión)

---

## 1. Inicio de sesión

Al acceder a la aplicación por primera vez verás una pantalla de inicio de sesión.

![Login](screenshot-login.png)

### Cómo iniciar sesión

1. Ingresa tu **correo electrónico** en el campo "Correo electrónico".
2. Ingresa tu **contraseña** en el campo "Contraseña".
3. Haz clic en el botón **"Iniciar Sesión"**.

### Credenciales por defecto (primer uso)

| Correo | Contraseña | Rol |
|--------|-----------|-----|
| admin@cash.com | Admin1234! | Administrador |

> Si no recuerdas tu contraseña, contacta al administrador del sistema para que la restablezca.

### Validaciones

- El correo debe tener un formato válido (ej: `usuario@dominio.com`).
- La contraseña debe tener al menos 8 caracteres.
- Si las credenciales son incorrectas, verás un mensaje de error en pantalla.

---

## 2. Barra de navegación

Una vez dentro del sistema, en la parte superior verás la barra de navegación:

| Elemento | Descripción |
|----------|-------------|
| **Cash Management** | Logo de la aplicación |
| **Nombre del usuario** | Muestra tu nombre |
| **Rol** | Muestra tu rol (Administrador / Organizador) |
| **Cerrar sesión** | Botón para salir de la aplicación |

---

## 3. Menú lateral

En el lado izquierdo se encuentra el menú de navegación con las siguientes opciones:

| Opción | Ruta | Descripción | Visible para |
|--------|------|-------------|--------------|
| 🏠 Dashboard | `/` | Panel principal con indicadores | Todos |
| ✂ Procesar Corte | `/process` | Generar un nuevo corte de deuda | Todos |
| 💰 Ver Cortes | `/cuts` | Historial de todos los cortes procesados | Todos |
| ⚙ Usuarios | `/admin/users` | Administración de usuarios del sistema | Solo Administradores |

La opción activa se resalta con un fondo azul.

---

## 4. Dashboard

Al iniciar sesión llegarás al **Dashboard** (panel principal).

### Tarjetas de indicadores (KPIs)

| Indicador | Descripción |
|-----------|-------------|
| **Monto en Cartera** | Monto total de deuda del corte activo |
| **Clientes con Deuda** | Número total de registros/clientes en el corte activo |
| **Último Proceso** | Fecha del último corte procesado |

### Gráfico de distribución

En la parte inferior se muestra un **gráfico de pastel** con la distribución de registros por tipo de servicio:

- **Módulo Urbano** — Catastro Urbano
- **Módulo Rural** — Catastro Rural
- **Agua Potable** — Módulo de Agua Potable

Cada segmento está identificado con un color distinto. Al pasar el cursor sobre el gráfico puedes ver los valores.

### Módulo de Operaciones

A la derecha del gráfico hay una tarjeta informativa con la descripción del sistema y un botón **"Procesar Nuevo Corte"** que te lleva directamente a la página de procesamiento.

---

## 5. Procesar corte

Esta página te permite generar un nuevo reporte consolidado de deudas.

### Pasos para procesar un corte

1. Selecciona la **fecha de corte** en el campo de fecha (por defecto aparece la fecha actual).
2. Haz clic en el botón **"Procesar"**.

> El sistema consultará la base de datos del SIIM para obtener las facturas, calculará intereses, mora, descuentos y recargos automáticamente.

### Durante el procesamiento

Verás un mensaje con un spinner: **"Procesando información del SIIM..."**

### Resultado del corte

Cuando el proceso finalice exitosamente verás:

✅ Un mensaje verde con el resultado (ej: *"Proceso completado. 1,234 clientes con deuda."*)

Tres tarjetas con el resumen:

| Tarjeta | Descripción |
|---------|-------------|
| **Fecha de Corte** | La fecha que seleccionaste |
| **Total Registros** | Número de facturas/clientes procesados |
| **Total Deuda** | Monto total acumulado de la deuda |

### Descarga de archivos

Puedes descargar el reporte en dos formatos:

1. **Descargar TXT** (botón ámbar) — Genera un archivo de texto plano.
2. **Descargar Excel** (botón verde) — Genera un archivo de Excel.

Antes de descargar puedes marcar la opción:

> ☐ **Detalle de deuda (Línea individual por cliente, módulo y año)**

Si activas esta opción, el archivo incluirá el detalle completo de cada factura en lugar de solo el resumen.

> Durante la descarga verás una alerta: *"Generando archivo en el navegador..."* — Espera a que se complete.

---

## 6. Historial de cortes

Esta página muestra **todos los cortes procesados** en el sistema, ordenados por estado.

### Buscar cortes

En la parte superior hay una barra de búsqueda con lupa. Puedes buscar por:

- **Fecha de corte** (ej: `2026-01-15`)
- **Estado** (`ACTIVO` / `INACTIVO`)
- **Usuario** que realizó el corte

La tabla se filtrará automáticamente mientras escribes.

### Columnas de la tabla

| Columna | Descripción |
|---------|-------------|
| **#** | Número consecutivo |
| **Fecha Corte** | Fecha en que se procesó el corte |
| **Total Registros** | Cantidad de facturas/clientes |
| **Total Deuda** | Monto total de la deuda |
| **Estado** | Indicador visual: verde con luz pulsante = Activo, gris = Inactivo |
| **Creado Por** | Nombre del usuario que procesó el corte |
| **Acciones** | Botones de descarga (solo para cortes activos) |

### Paginación

La tabla muestra **10 resultados por página**. En la parte inferior puedes navegar:

- **Anterior / Siguiente** — Botones para cambiar de página
- **Números de página** — Haz clic en un número para ir directamente

El texto inferior indica: *"Mostrando 1-10 de 47 resultados"*

### Acciones por corte

- Si el corte está **ACTIVO**: aparecen los botones de descarga TXT y Excel comprimidos.
- Si el corte está **INACTIVO**: se muestra un guion (`—`) en lugar de los botones.

---

## 7. Gestión de usuarios (Administradores)

> Esta sección solo está disponible para usuarios con rol **Administrador**.

### Acceder

Haz clic en **⚙ Usuarios** en el menú lateral.

### Listado de usuarios

La tabla muestra todos los usuarios registrados en el sistema, con las siguientes columnas:

| Columna | Descripción |
|---------|-------------|
| **Usuario** | Avatar con iniciales, nombre y correo electrónico |
| **Rol** | Badge morado = Administrador, Badge gris = Organizador |
| **Estado** | Badge verde = Activo, Badge rojo = Inactivo |
| **Creado** | Fecha de creación del usuario |
| **Acciones** | Botones: Editar, Contraseña, Eliminar |

### Crear un nuevo usuario

1. Haz clic en el botón **"+ Nuevo usuario"** en la parte superior derecha.
2. Completa el formulario:

| Campo | Descripción |
|-------|-------------|
| **Nombre** | Nombre completo del usuario |
| **Correo electrónico** | Correo con el que iniciará sesión |
| **Contraseña** | Mínimo 8 caracteres |
| **Rol** | Selecciona: *Organizador* (acceso básico) o *Administrador* (acceso total) |

3. Haz clic en **"Crear usuario"**.

### Editar un usuario

1. En la fila del usuario, haz clic en **"Editar"**.
2. Modifica los campos necesarios:

| Campo | Descripción |
|-------|-------------|
| **Nombre** | Nombre completo |
| **Rol** | Cambiar entre Organizador / Administrador |
| **Usuario activo** | Casilla para activar o desactivar la cuenta |

3. Haz clic en **"Guardar cambios"**.

### Cambiar contraseña de un usuario

1. En la fila del usuario, haz clic en **"Contraseña"**.
2. Ingresa la nueva contraseña (mínimo 8 caracteres).
3. Haz clic en **"Actualizar"**.

### Eliminar un usuario (desactivación)

1. En la fila del usuario, haz clic en **"Eliminar"**.
2. Aparecerá una ventana de confirmación: *"¿Eliminar al usuario 'Nombre'? Esta acción no se puede deshacer."*
3. Haz clic en **"Aceptar"** para confirmar o **"Cancelar"** para volver.

> La eliminación es una **desactivación lógica**: el usuario queda marcado como inactivo, no se borra definitivamente de la base de datos.

### Paginación

Al igual que en el historial de cortes, la tabla de usuarios muestra **10 resultados por página** con navegación inferior.

---

## 8. Cerrar sesión

Para cerrar la sesión:

1. En la barra de navegación superior, haz clic en **"Cerrar sesión"**.
2. Serás redirigido a la pantalla de inicio de sesión.

> Si tu sesión expira (token inválido), el sistema te redirigirá automáticamente al login.

---

## Roles y permisos

| Funcionalidad | Administrador | Organizador |
|---------------|:-------------:|:-----------:|
| Ver Dashboard | ✅ | ✅ |
| Procesar corte | ✅ | ✅ |
| Ver historial de cortes | ✅ | ✅ |
| Descargar reportes TXT/Excel | ✅ | ✅ |
| Gestionar usuarios | ✅ | ❌ |
| Acceder a Usuarios en el menú | ✅ | ❌ |

---

## Solución de problemas

| Problema | Posible solución |
|----------|------------------|
| No recuerdo mi contraseña | Solicitar al administrador que la restablezca |
| No veo la opción Usuarios en el menú | Tu rol es Organizador, no tienes permisos |
| El proceso de corte falla | Verificar conexión con el servidor SIIM |
| La descarga no inicia | Revisar que el navegador no bloquee las descargas |
| La sesión se cierra sola | El token expiró, inicia sesión nuevamente |
