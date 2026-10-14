import { describe, expect, it } from 'vitest';
import { dragStructure } from './ticket-diagnostics';

describe('drag structural diagnostics', () => {
  it('captures native wrappers and alternate headers without content or identities', () => {
    document.body.innerHTML = `<div class="work-item-form-page">
      <div class="work-item-grid"><div class="work-item-form-first-section">
        <div class="work-item-form-group work-item-39999999 confidential-project" id="ticket-39999999" data-field-name="Custom.Private">
          <h2 class="work-item-form-collapsible-header">Confidential card label</h2>
          <div class="work-item-form-control-wrapper"><textarea>Private draft value</textarea><h3>Private content heading</h3></div>
        </div></div>
        <div class="work-item-form-discussion"><h3 class="bolt-heading">Private discussion label</h3><p>Private comment</p></div>
      </div></div>`;
    const root = document.querySelector<HTMLElement>('.work-item-form-page');
    if (!root) throw new Error('Missing form fixture.');
    const encoded = JSON.stringify(dragStructure(root));
    expect(encoded).toContain('work-item-grid');
    expect(encoded).toContain('bolt-heading');
    for (const text of ['Confidential', 'confidential', 'Private', '39999999', 'Custom.Private', 'textarea']) expect(encoded).not.toContain(text);
  });
});
