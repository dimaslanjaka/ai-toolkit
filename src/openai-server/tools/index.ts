/**
 * Built-in tools for the OpenAI-compatible server
 *
 * Merged from:
 *   - Original index.ts: get_time, calculate, get_weather, search
 *   - tool-v2.js: write (real), todowrite, validation, routing, retry
 */

import fs from 'fs-extra';
import { registerTool, ToolDefinition } from './tool-registry.js';

// =========================================================
// VALIDATION HELPERS
// =========================================================

function validateArgs(args: any, requiredKeys: string[]): void {
  if (!args || typeof args !== 'object') {
    throw new Error('Tool args must be an object');
  }
  for (const key of requiredKeys) {
    if (args[key] === undefined || args[key] === null) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
}

// =========================================================
// TOOL DEFINITIONS
// =========================================================

/**
 * Read content from a file
 */
const readTool: ToolDefinition = {
  name: 'read',
  description: 'Read content from a file on disk',
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to the file' }
    },
    required: ['filePath']
  },
  handler: async (args: Record<string, any>) => {
    validateArgs(args, ['filePath']);
    const content = await fs.readFile(args.filePath, 'utf8');
    return {
      filePath: args.filePath,
      bytes: Buffer.byteLength(content),
      content
    };
  }
};

/**
 * Write content to a file
 */
const writeTool: ToolDefinition = {
  name: 'write',
  description: 'Write content to a file on disk',
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to the file' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['filePath', 'content']
  },
  handler: async (args: Record<string, any>) => {
    validateArgs(args, ['filePath', 'content']);
    await fs.writeFile(args.filePath, args.content, 'utf8');
    return {
      filePath: args.filePath,
      bytes: Buffer.byteLength(args.content),
      status: 'written'
    };
  }
};

/**
 * Update a structured todo list
 */
const todoTool: ToolDefinition = {
  name: 'todowrite',
  description: 'Create or update a structured todo/task list',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Array of todo items',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      }
    },
    required: ['todos']
  },
  handler: async (args: Record<string, any>) => {
    validateArgs(args, ['todos']);
    if (!Array.isArray(args.todos)) {
      throw new Error('todos must be an array');
    }
    return {
      updated: args.todos.map((t: any) => ({
        ...t,
        updatedAt: new Date().toISOString()
      }))
    };
  }
};

/**
 * Get current time tool
 */
const getTimeTool: ToolDefinition = {
  name: 'get_time',
  description: 'Get the current date and time',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Timezone (e.g., "UTC", "America/New_York")',
        default: 'UTC'
      },
      format: {
        type: 'string',
        description: 'Output format: "iso", "unix", "readable"',
        enum: ['iso', 'unix', 'readable'],
        default: 'iso'
      }
    },
    required: []
  },
  handler: async (args: Record<string, any>) => {
    const { timezone = 'UTC', format = 'iso' } = args;
    const now = new Date();

    let date: Date;
    if (timezone === 'UTC') {
      date = new Date(now.toISOString());
    } else {
      try {
        date = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      } catch {
        date = now;
      }
    }

    switch (format) {
      case 'unix':
        return { time: Math.floor(date.getTime() / 1000), timezone, format };
      case 'readable':
        return { time: date.toLocaleString(), timezone, format };
      case 'iso':
      default:
        return { time: date.toISOString(), timezone, format };
    }
  }
};

/**
 * Simple calculator tool
 */
const calculatorTool: ToolDefinition = {
  name: 'calculate',
  description: 'Perform basic arithmetic calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2", "10 * 5", "(3 + 4) * 2")'
      }
    },
    required: ['expression']
  },
  handler: async (args: Record<string, any>) => {
    const { expression } = args;

    // Basic safety: only allow numbers, operators, parentheses, and spaces
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('Invalid expression: only numbers and basic operators allowed');
    }

    try {
      const result = eval(expression);
      return { expression, result };
    } catch (error) {
      throw new Error(`Calculation error: ${error instanceof Error ? error.message : 'Invalid expression'}`);
    }
  }
};

/**
 * Weather tool (mock implementation - replace with real API)
 */
const weatherTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or "lat,lon" coordinates'
      },
      units: {
        type: 'string',
        description: 'Temperature units',
        enum: ['metric', 'imperial'],
        default: 'metric'
      }
    },
    required: ['location']
  },
  handler: async (args: Record<string, any>) => {
    const { location, units = 'metric' } = args;

    // Mock weather data - replace with real API call
    return {
      location,
      temperature: units === 'imperial' ? 72 : 22,
      condition: 'Sunny',
      humidity: 65,
      windSpeed: units === 'imperial' ? '10 mph' : '16 km/h',
      units
    };
  }
};

/**
 * Search tool (mock implementation - replace with real API)
 */
const searchTool: ToolDefinition = {
  name: 'search',
  description: 'Search the web for information',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results',
        default: 5
      }
    },
    required: ['query']
  },
  handler: async (args: Record<string, any>) => {
    const { query, maxResults = 5 } = args;

    // Mock search results - replace with real search API
    return {
      query,
      results: Array.from({ length: Math.min(maxResults, 3) }, (_, i) => ({
        title: `Result ${i + 1} for "${query}"`,
        url: `https://example.com/result-${i + 1}`,
        snippet: `This is a sample search result for "${query}"...`
      }))
    };
  }
};

// =========================================================
// TOOL ROUTING (metadata for multi-agent dispatch)
// =========================================================

/**
 * Route a tool call to the appropriate agent label.
 * Useful for logging, metrics, or future multi-agent dispatch.
 */
export function routeTool(toolName: string, args: Record<string, any>): string {
  if (toolName === 'read') {
    if (args.filePath?.includes('config')) return 'config-agent';
    if (args.filePath?.endsWith('.json')) return 'data-agent';
    return 'filesystem-agent';
  }
  if (toolName === 'write') {
    if (args.filePath?.endsWith('.md')) return 'markdown-agent';
    if (args.filePath?.includes('config')) return 'config-agent';
    return 'filesystem-agent';
  }
  if (toolName === 'search') return 'retrieval-agent';
  if (toolName === 'todowrite') return 'task-agent';
  if (toolName === 'calculate') return 'computation-agent';
  if (toolName === 'get_time') return 'utility-agent';
  if (toolName === 'get_weather') return 'utility-agent';
  return 'default-agent';
}

// =========================================================
// REGISTRATION
// =========================================================

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  registerTool(readTool);
  registerTool(writeTool);
  registerTool(todoTool);
  registerTool(getTimeTool);
  registerTool(calculatorTool);
  registerTool(weatherTool);
  registerTool(searchTool);
}

// Auto-register on import
registerBuiltinTools();
