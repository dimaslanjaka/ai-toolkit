async function fetchModelInfo() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/show', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3:8b'
      })
    });

    const data = await response.json();

    console.log(data);
    return data;
  } catch (error) {
    console.error('Error fetching model info:', error);
  }
}

fetchModelInfo();
