import { createStreamingBuffer, DEFAULT_STREAMING_THROTTLE_MS } from '../../utils/streamingBuffer';

/** Streaming buffer singleton shared across slices */
export const streamingBuffer = createStreamingBuffer(DEFAULT_STREAMING_THROTTLE_MS);
