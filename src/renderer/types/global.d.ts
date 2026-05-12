import type { API } from '../../preload/api';

declare global {
  interface Window {
    api: API;
  }
}

export {};
