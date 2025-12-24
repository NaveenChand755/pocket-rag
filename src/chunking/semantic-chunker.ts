const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export class SemanticChunker {
  // ~4 chars per token, so 1000 tokens ≈ 4000 chars
  constructor(
    private chunkSize: number = 4000,
    private chunkOverlap: number = 800
  ) {}

  chunk(text: string): string[] {
    const chunks = this.splitRecursive(text, SEPARATORS);
    return this.addOverlap(chunks, text);
  }

  private splitRecursive(text: string, separators: string[]): string[] {
    if (text.length <= this.chunkSize) {
      return text.trim() ? [text.trim()] : [];
    }

    if (separators.length === 0) {
      return this.forceSplit(text);
    }

    const [sep, ...restSeps] = separators;
    const splits = sep ? text.split(sep) : [...text];

    const chunks: string[] = [];
    let current = "";

    for (const split of splits) {
      const candidate = current ? current + sep + split : split;

      if (candidate.length <= this.chunkSize) {
        current = candidate;
      } else {
        if (current) {
          chunks.push(current.trim());
        }
        // If single split is too large, recursively split it
        if (split.length > this.chunkSize) {
          chunks.push(...this.splitRecursive(split, restSeps));
          current = "";
        } else {
          current = split;
        }
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private forceSplit(text: string): string[] {
    const chunks: string[] = [];
    const step = this.chunkSize - this.chunkOverlap;
    for (let i = 0; i < text.length; i += step) {
      chunks.push(text.slice(i, i + this.chunkSize));
    }
    return chunks;
  }

  private addOverlap(chunks: string[], originalText: string): string[] {
    if (chunks.length <= 1) return chunks;

    // For semantic splits, we keep chunks as-is since overlap
    // is mainly needed for force-split scenarios
    return chunks.filter((chunk) => chunk.length > 0);
  }
}
