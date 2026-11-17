import { fakeAsync, tick } from '@angular/core/testing';
import { FigshareCrosswalkListComponent } from './figshare-crosswalk-list.component';

describe('Figshare crosswalk delete focus', () => {
  it('returns to the menu summary after Cancel', fakeAsync(() => {
    const menu = document.createElement('details');
    menu.innerHTML = '<summary>More actions</summary><button>Delete</button>';
    document.body.append(menu);
    try {
      menu.open = true;
      menu.querySelector('button')!.focus();
      const component = new FigshareCrosswalkListComponent();
      component.requestDelete({ id: 'crosswalk' } as any);
      menu.open = false;
      component.cancelDelete();
      tick();
      expect(document.activeElement).toBe(menu.querySelector('summary'));
    } finally { menu.remove(); }
  }));
});
