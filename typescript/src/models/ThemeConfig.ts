import { Attr, Entity } from '../../lib/decorators';

@Entity('themeconfig')
export class ThemeConfig {
  @Attr({ type: 'string' })
  public name?: string;

  @Attr({ type: 'string' })
  public css?: string;
}
