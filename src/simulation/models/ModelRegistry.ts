import type { ComponentModel } from './ComponentModel';

export class ModelRegistry {
  private factories = new Map<string, () => ComponentModel>();

  register(type: string, factory: () => ComponentModel): void {
    this.factories.set(type, factory);
  }

  create(type: string): ComponentModel | null {
    const factory = this.factories.get(type);
    return factory ? factory() : null;
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }
}
