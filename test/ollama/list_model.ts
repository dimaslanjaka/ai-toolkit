async function listModels() {
  const res = await fetch('http://localhost:11434/api/tags');
  const data = await res.json();
  console.log(
    'Installed models:',
    data.models.map((m: Record<string, any>) => m.name)
  );
}

listModels();
