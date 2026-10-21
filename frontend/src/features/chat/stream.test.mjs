import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readChatStream } from './stream.js';

function streamedResponse(parts) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  }));
}

test('renders UTF-8 deltas even when SSE frames span network chunks', async () => {
  const deltas = [];
  const response = streamedResponse([
    'event: delta\ndata: {"text":"Xin ',
    'chào"}\n\nevent: delta\ndata: {"text":" bạn"}\n\n',
    'event: done\ndata: {}\n\n',
  ]);
  await readChatStream(response, text => deltas.push(text));
  assert.deepEqual(deltas, ['Xin chào', ' bạn']);
});

test('rejects a stream that ends without a done event', async () => {
  await assert.rejects(readChatStream(streamedResponse(['event: delta\ndata: {"text":"partial"}\n\n']), () => {}));
});

test('surfaces provider errors instead of saving an incomplete answer', async () => {
  await assert.rejects(
    readChatStream(streamedResponse(['event: error\ndata: {"code":"rate_limited","message":"Busy"}\n\n']), () => {}),
    error => error.code === 'rate_limited',
  );
});
