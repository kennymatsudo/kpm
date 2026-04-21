export interface DocumentCodec<External = unknown> {
  fromExternal(value: External | null | undefined): string | null;
  toExternal(markdown: string | null | undefined): External | null;
}
