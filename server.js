const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de seguridad básica
app.use(helmet());
app.use(cors());
app.use(express.json());

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'mcp-supabase-server',
    version: '2.0.0'
  });
});

// Endpoint principal del MCP
app.post('/mcp', async (req, res) => {
  try {
    const { method, params } = req.body;
    
    if (!method) {
      return res.status(400).json({
        error: 'Método requerido',
        availableMethods: ['tools/list', 'tools/call']
      });
    }

    let result;

    switch (method) {
      case 'tools/call':
        result = await handleToolCall(params);
        break;
        
      case 'tools/list':
        result = getAvailableTools();
        break;
        
      default:
        return res.status(404).json({ 
          error: 'Método no soportado',
          availableMethods: ['tools/list', 'tools/call']
        });
    }

    res.json({ result });
    
  } catch (error) {
    console.error('Error en MCP:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Error procesando solicitud'
    });
  }
});

// Lista de herramientas disponibles
function getAvailableTools() {
  return {
    tools: [
      {
        name: 'supabase_query',
        description: 'Ejecuta consultas CRUD en Supabase',
        inputSchema: {
          type: 'object',
          properties: {
            action: { 
              type: 'string', 
              enum: ['select', 'insert', 'update', 'delete'],
              description: 'Tipo de operación a realizar'
            },
            table: { 
              type: 'string',
              description: 'Nombre de la tabla en Supabase'
            },
            data: { 
              type: 'object',
              description: 'Datos para insert/update (opcional para select/delete)'
            },
            filters: { 
              type: 'object',
              description: 'Filtros WHERE para la consulta (opcional)'
            },
            select: {
              type: 'string',
              description: 'Columnas a seleccionar (default: *)'
            },
            limit: {
              type: 'number',
              description: 'Límite de resultados (opcional)'
            },
            orderBy: {
              type: 'string',
              description: 'Ordenamiento de resultados (ej: "nombre.asc")'
            }
          },
          required: ['action', 'table']
        }
      },
      {
        name: 'supabase_schema',
        description: 'Consulta información del esquema de la base de datos',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['list_tables', 'describe_table', 'table_stats'],
              description: 'Tipo de consulta de esquema'
            },
            table: {
              type: 'string',
              description: 'Nombre de la tabla (requerido para describe_table y table_stats)'
            }
          },
          required: ['operation']
        }
      },
      {
        name: 'supabase_modify_schema',
        description: 'Modifica la estructura de la base de datos (simulado por seguridad)',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['create_table', 'add_column', 'drop_column', 'drop_table'],
              description: 'Tipo de modificación de esquema'
            },
            table: {
              type: 'string',
              description: 'Nombre de la tabla'
            },
            column: {
              type: 'string',
              description: 'Nombre de la columna (para operaciones de columna)'
            },
            dataType: {
              type: 'string',
              description: 'Tipo de datos de la columna (ej: text, integer, boolean)'
            }
          },
          required: ['operation', 'table']
        }
      }
    ]
  };
}

// Manejo de llamadas a herramientas
async function handleToolCall(params) {
  const { name, arguments: args } = params;
  
  console.log(`Ejecutando herramienta: ${name}`, args);
  
  switch (name) {
    case 'supabase_query':
      return await executeSupabaseQuery(args);
    case 'supabase_schema':
      return await querySupabaseSchema(args);
    case 'supabase_modify_schema':
      return await modifySupabaseSchema(args);
    default:
      throw new Error(`Herramienta '${name}' no reconocida`);
  }
}

// Función para consultas CRUD
async function executeSupabaseQuery({ action, table, data = {}, filters = {}, select = '*', limit, orderBy }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Credenciales de Supabase no configuradas. Verifica SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  }

  let url = `${supabaseUrl}/rest/v1/${table}`;
  let method = 'GET';
  let body = null;
  
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  switch (action) {
    case 'select':
      method = 'GET';
      const queryParams = new URLSearchParams();
      
      if (select && select !== '*') {
        queryParams.append('select', select);
      }
      
      Object.entries(filters).forEach(([key, value]) => {
        queryParams.append(key, `eq.${value}`);
      });
      
      if (limit) {
        queryParams.append('limit', limit.toString());
      }
      
      if (orderBy) {
        queryParams.append('order', orderBy);
      }
      
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
      break;
      
    case 'insert':
      method = 'POST';
      headers['Prefer'] = 'return=representation';
      body = JSON.stringify(data);
      break;
      
    case 'update':
      method = 'PATCH';
      headers['Prefer'] = 'return=representation';
      body = JSON.stringify(data);
      
      if (Object.keys(filters).length > 0) {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          queryParams.append(key, `eq.${value}`);
        });
        url += `?${queryParams.toString()}`;
      } else {
        throw new Error('UPDATE requiere filtros para especificar qué registros actualizar');
      }
      break;
      
    case 'delete':
      method = 'DELETE';
      headers['Prefer'] = 'return=representation';
      
      if (Object.keys(filters).length > 0) {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          queryParams.append(key, `eq.${value}`);
        });
        url += `?${queryParams.toString()}`;
      } else {
        throw new Error('DELETE requiere filtros para especificar qué registros eliminar');
      }
      break;
      
    default:
      throw new Error(`Acción '${action}' no soportada`);
  }

  console.log(`Ejecutando ${action} en ${table}:`, { url: url.replace(supabaseKey, '***'), method });

  const response = await fetch(url, {
    method,
    headers,
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de Supabase (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  
  return {
    success: true,
    action,
    table,
    data: result,
    count: Array.isArray(result) ? result.length : (result ? 1 : 0),
    timestamp: new Date().toISOString()
  };
}

// Función para consultar esquemas
async function querySupabaseSchema({ operation, table }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Credenciales de Supabase no configuradas');
  }

  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  };

  try {
    switch (operation) {
      case 'list_tables':
        // Obtener esquema desde endpoint raíz
        const schemaResponse = await fetch(`${supabaseUrl}/rest/v1/`, { headers });
        
        if (!schemaResponse.ok) {
          throw new Error(`Error consultando esquema: ${schemaResponse.status}`);
        }
        
        const schemaData = await schemaResponse.json();
        const tables = Object.keys(schemaData.definitions || {}).filter(name => 
          !name.startsWith('rpc_')
        );
        
        return {
          success: true,
          operation: 'list_tables',
          data: {
            tables: tables,
            count: tables.length
          },
          timestamp: new Date().toISOString()
        };
        
      case 'describe_table':
        if (!table) {
          throw new Error('Nombre de tabla requerido para describe_table');
        }
        
        // Verificar que la tabla existe
        const tableCheckResponse = await fetch(`${supabaseUrl}/rest/v1/${table}?limit=0`, {
          method: 'HEAD',
          headers
        });
        
        if (!tableCheckResponse.ok) {
          throw new Error(`Tabla '${table}' no encontrada o sin acceso`);
        }
        
        // Obtener muestra de datos para inferir estructura
        const sampleResponse = await fetch(`${supabaseUrl}/rest/v1/${table}?limit=1`, { headers });
        
        if (!sampleResponse.ok) {
          throw new Error(`Error consultando tabla '${table}': ${sampleResponse.status}`);
        }
        
        const sampleData = await sampleResponse.json();
        
        let columns = [];
        if (sampleData.length > 0) {
          const firstRow = sampleData[0];
          columns = Object.entries(firstRow).map(([columnName, value]) => ({
            column_name: columnName,
            data_type: typeof value === 'number' ? 
              (Number.isInteger(value) ? 'integer' : 'numeric') :
              typeof value === 'boolean' ? 'boolean' :
              typeof value === 'object' && value !== null ? 'json' :
              'text',
            sample_value: value,
            is_nullable: value === null ? 'YES' : 'UNKNOWN'
          }));
        } else {
          columns = [{ 
            column_name: 'no_data',
            data_type: 'unknown',
            note: 'Tabla vacía - no se puede determinar estructura'
          }];
        }
        
        return {
          success: true,
          operation: 'describe_table',
          data: {
            table: table,
            columns: columns,
            column_count: columns.length
          },
          timestamp: new Date().toISOString()
        };
        
      case 'table_stats':
        if (!table) {
          throw new Error('Nombre de tabla requerido para table_stats');
        }
        
        const statsResponse = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=0`, {
          method: 'HEAD',
          headers: { ...headers, 'Prefer': 'count=exact' }
        });
        
        if (!statsResponse.ok) {
          throw new Error(`Error obteniendo estadísticas de '${table}': ${statsResponse.status}`);
        }
        
        const contentRange = statsResponse.headers.get('Content-Range');
        const totalCount = contentRange ? parseInt(contentRange.split('/')[1]) || 0 : 0;
        
        return {
          success: true,
          operation: 'table_stats',
          data: {
            table: table,
            total_rows: totalCount,
            last_checked: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
        
      default:
        throw new Error(`Operación de esquema '${operation}' no soportada`);
    }
    
  } catch (error) {
    console.error('Error en querySupabaseSchema:', error);
    throw error;
  }
}

// Función para modificar esquema (simulado)
async function modifySupabaseSchema({ operation, table, column, dataType }) {
  console.warn('Schema modification requested (SIMULATED):', { operation, table, column, dataType });
  
  const result = {
    success: true,
    operation: operation,
    table: table,
    simulated: true,
    message: '',
    warning: '⚠️ Esta es una SIMULACIÓN. Modificaciones reales requieren configuración SQL adicional en Supabase.',
    timestamp: new Date().toISOString()
  };
  
  switch (operation) {
    case 'create_table':
      result.message = `SIMULACIÓN: Crear tabla '${table}' solicitada.`;
      break;
      
    case 'add_column':
      if (!column || !dataType) {
        throw new Error('Nombre de columna y tipo de datos requeridos para add_column');
      }
      result.message = `SIMULACIÓN: Agregar columna '${column}' de tipo '${dataType}' a tabla '${table}'.`;
      break;
      
    case 'drop_column':
      if (!column) {
        throw new Error('Nombre de columna requerido para drop_column');
      }
      result.message = `SIMULACIÓN: Eliminar columna '${column}' de tabla '${table}'. ¡OPERACIÓN DESTRUCTIVA!`;
      break;
      
    case 'drop_table':
      result.message = `SIMULACIÓN: Eliminar tabla '${table}'. ¡OPERACIÓN DESTRUCTIVA!`;
      break;
      
    default:
      throw new Error(`Operación '${operation}' no soportada`);
  }
  
  return {
    success: true,
    data: result
  };
}

// Endpoint de diagnóstico
app.get('/diagnostics', (req, res) => {
  const tools = getAvailableTools();
  
  res.json({
    server_info: {
      name: 'mcp-supabase-server',
      version: '2.0.0',
      status: 'running',
      deployment: 'github',
      features: ['crud', 'schema_query', 'schema_modify_simulation']
    },
    available_tools: tools.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      operations: tool.inputSchema.properties?.operation?.enum || 
                  tool.inputSchema.properties?.action?.enum || 
                  ['general']
    })),
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      diagnostics: '/diagnostics'
    },
    environment: {
      node_env: process.env.NODE_ENV || 'production',
      port: PORT,
      supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MCP Supabase Server v2.0 ejecutándose en puerto ${PORT}`);
  console.log(`📊 Supabase: ${process.env.SUPABASE_URL ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`🔑 Service Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🔧 Diagnóstico: http://localhost:${PORT}/diagnostics`);
  console.log(`🛠️ Herramientas: supabase_query, supabase_schema, supabase_modify_schema`);
});

module.exports = app;
