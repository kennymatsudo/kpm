import { createKeyedStreamingBuffer } from '../../utils/streamingBuffer';

/** Per-session streaming buffer shared across slices, keyed by chatSessionId */
export const streamingBuffer = createKeyedStreamingBuffer();
