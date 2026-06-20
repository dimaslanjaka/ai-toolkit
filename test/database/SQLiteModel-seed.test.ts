import { SQLiteModel } from '../../src/database/SQLiteModel.js';

describe('SQLiteModel seed', () => {
  let modelDb: SQLiteModel;

  beforeAll(async () => {
    modelDb = new SQLiteModel({
      db_type: 'sqlite',
      sqlite_filename: ':memory:'
    } as any);
    await modelDb.initialize();
  });

  afterAll(async () => {
    if (modelDb) {
      await modelDb.close();
    }
  });

  test('should seed models from SQLiteModel-seed.sql', async () => {
    const modelsApi = await modelDb.models();
    const allModels = await modelsApi.find({});

    expect(allModels.length).toBeGreaterThan(0);

    // Verify specific known models by provider
    const opencodeModels = allModels.filter((m: any) => m.provider === 'opencode');
    expect(opencodeModels.length).toBe(7);
    expect(opencodeModels.some((m: any) => m.id === 'deepseek-v4-flash-free')).toBe(true);
    expect(opencodeModels.some((m: any) => m.id === 'big-pickle')).toBe(true);
    expect(opencodeModels.some((m: any) => m.id === 'north-mini-code-free')).toBe(true);

    const chatgptModels = allModels.filter((m: any) => m.provider === 'chatgpt');
    expect(chatgptModels.length).toBe(2);
    expect(chatgptModels.some((m: any) => m.id === 'gpt-4o')).toBe(true);
    expect(chatgptModels.some((m: any) => m.id === 'gpt-4')).toBe(true);

    // puter has the largest set of models
    const puterModels = allModels.filter((m: any) => m.provider === 'puter');
    expect(puterModels.length).toBeGreaterThan(50);
    expect(puterModels.some((m: any) => m.id === 'gpt-5.5-pro')).toBe(true);
    expect(puterModels.some((m: any) => m.id === 'claude-sonnet-4-6')).toBe(true);
  });

  test('seeded models should have correct structure', async () => {
    const modelsApi = await modelDb.models();
    const allModels = await modelsApi.find({});

    for (const model of allModels) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('provider');
      expect(model).toHaveProperty('enabled');
      expect(model).toHaveProperty('owned_by');
      expect(model).toHaveProperty('permission');
      expect(typeof model.permission).toBe('string');
    }
  });
});
