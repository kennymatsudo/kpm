import { describe, it, expect } from 'vitest';
import { createBoundedOutputBuffer } from './outputBuffer';

describe('createBoundedOutputBuffer', () => {
  it('returns an empty string when nothing has been appended', () => {
    const buffer = createBoundedOutputBuffer(10);
    expect(buffer.read()).toBe('');
    expect(buffer.length).toBe(0);
  });

  it('stays within the cap after many small appends', () => {
    const buffer = createBoundedOutputBuffer(10);
    for (let i = 0; i < 20; i++) {
      buffer.append(String(i));
    }
    expect(buffer.length).toBeLessThanOrEqual(10);
  });

  it('retains exactly the tail of the full concatenation across a multi-chunk sequence', () => {
    const max = 10;
    const buffer = createBoundedOutputBuffer(max);
    const appended = ['1234567890', 'ab', 'cde', 'f', 'ghijklmno'];
    let full = '';
    for (const chunk of appended) {
      buffer.append(chunk);
      full += chunk;
    }
    expect(buffer.read()).toBe(full.slice(-max));
  });

  it('keeps the tail of a single chunk larger than the cap', () => {
    const buffer = createBoundedOutputBuffer(5);
    buffer.append('abcdefghij');
    expect(buffer.read()).toBe('fghij');
  });

  it('read() is stable across repeated calls with no append in between', () => {
    const buffer = createBoundedOutputBuffer(10);
    buffer.append('hello');
    buffer.append('world');
    const first = buffer.read();
    const second = buffer.read();
    expect(first).toBe(second);
    expect(first).toBe('helloworld'.slice(-10));
  });

  it('treats a non-positive cap as an always-empty buffer', () => {
    const buffer = createBoundedOutputBuffer(0);
    buffer.append('anything');
    expect(buffer.read()).toBe('');
    expect(buffer.length).toBe(0);
  });
});
