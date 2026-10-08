// Bounded top-K selection. Keeps the K best items seen so far in a binary heap
// whose root is the worst retained item, so each candidate costs O(log K) and
// memory stays O(K) regardless of how many documents match.

export class BoundedHeap<T> {
  private readonly items: T[] = [];

  // `before(a, b)` is true when a ranks ahead of b. It must be a strict total
  // order for results to be stable across runs.
  constructor(
    private readonly capacity: number,
    private readonly before: (a: T, b: T) => boolean,
  ) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    if (this.capacity <= 0) return;
    const items = this.items;
    if (items.length < this.capacity) {
      items.push(item);
      this.siftUp(items.length - 1);
      return;
    }
    if (!this.before(item, items[0])) return;
    items[0] = item;
    this.siftDown(0);
  }

  // Best first.
  toSortedArray(): T[] {
    return [...this.items].sort((a, b) => (this.before(a, b) ? -1 : this.before(b, a) ? 1 : 0));
  }

  private siftUp(index: number): void {
    const items = this.items;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      // The parent must be the worse of the two.
      if (!this.before(items[parent], items[index])) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  private siftDown(index: number): void {
    const items = this.items;
    const length = items.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < length && this.before(items[worst], items[left])) worst = left;
      if (right < length && this.before(items[worst], items[right])) worst = right;
      if (worst === index) return;
      [items[worst], items[index]] = [items[index], items[worst]];
      index = worst;
    }
  }
}
