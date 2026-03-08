export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private readonly resolvers: Array<(item: T) => void> = [];

  push(item: T): void {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(item);
      return;
    }
    this.items.push(item);
  }

  pop(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }

    return new Promise<T>((resolve) => {
      this.resolvers.push(resolve);
    });
  }
}
