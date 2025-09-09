# MCP Supabase Server

Servidor MCP (Model Context Protocol) para gestión completa de bases de datos Supabase con herramientas de esquema.

## Características

- ✅ **Operaciones CRUD** completas (select, insert, update, delete)
- ✅ **Consulta de esquemas** (listar tablas, describir estructura, estadísticas)
- ✅ **Modificación de esquemas** (simulado por seguridad)
- ✅ **Compatible con n8n** y otros clientes MCP
- ✅ **Deployment automático** desde GitHub

## Herramientas Disponibles

### 1. supabase_query
Ejecuta operaciones CRUD en Supabase.

### 2. supabase_schema  
Consulta información del esquema de la base de datos.

### 3. supabase_modify_schema
Simula modificaciones de estructura de BD.

## Deployment en EasyPanel

1. Conectar este repositorio a EasyPanel
2. Configurar variables de entorno
3. Deploy automático

## Variables de Entorno

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
NODE_ENV=production
PORT=3001
