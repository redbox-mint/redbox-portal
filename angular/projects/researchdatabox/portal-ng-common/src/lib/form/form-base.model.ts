

export abstract class ModelBase<T> {
  value: T;
  id: string;
  name: string;
  label: string;

  constructor(initJson: any) {
    this.value = initJson.value;
    this.id = '';
    this.name = '';
    this.label = '';
  }
}