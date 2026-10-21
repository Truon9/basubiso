export async function readChatStream(response, onDelta) {
  if (!response.body) throw new Error('Streaming response is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  function consume(frame) {
    const lines = frame.split('\n');
    const event = lines.find(line => line.startsWith('event: '))?.slice(7) || 'message';
    const data = lines.filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'delta') {
      if (typeof payload.text === 'string') onDelta(payload.text);
    } else if (event === 'done') {
      completed = true;
    } else if (event === 'error') {
      const error = new Error(payload.message || 'Chat stream interrupted.');
      error.code = payload.code;
      throw error;
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer.trim());
    if (!completed) throw new Error('Chat stream ended before completion.');
  } finally {
    reader.releaseLock();
  }
}
